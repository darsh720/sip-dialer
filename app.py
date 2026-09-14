"""
SIP Web Softphone — plain UDP version (FastAPI + pyVoIP)
==========================================================
Patched pyVoIP.SIP.SIPClient.route to answer Asterisk OPTIONS
qualify pings with 200 OK, preventing 'Unavail nan' status.
"""

import asyncio
from contextlib import asynccontextmanager
import audioop
import base64
import json
import os
import socket
import threading
import time
from typing import Optional

import pyaudio
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# NOTE: pyVoIP 1.6.8 introduced a dependency from SIP.py on
# pyVoIP.VoIP.status (PhoneStatus), creating a circular import between
# pyVoIP.SIP and pyVoIP.VoIP. Importing something under pyVoIP.VoIP
# *first* resolves the cycle correctly; importing pyVoIP.SIP first (as
# this file used to) triggers it from the wrong end and raises
# "AttributeError: partially initialized module 'pyVoIP.SIP' has no
# attribute 'SIPMessage'". Keep this import order.
from pyVoIP.VoIP import VoIPPhone, CallState, InvalidStateError
import pyVoIP.SIP
import pyVoIP.RTP as RTP
from pyVoIP.SIP import SIPClient, SIPMessage, SIPParseError, SIPStatus


# ---------------------------------------------------------------------------
# FIX 3: Bind the RTP socket to all interfaces (0.0.0.0) instead of the
# single private IP used for SDP advertisement. pyVoIP conflates the two,
# so on machines with more than one active network path (VPN adapter +
# LAN/Wi-Fi, etc.) the RTP socket can end up bound to an address the OS
# never actually delivers the caller's return audio to, even though the
# packets do arrive on the box (signaling still works because it binds
# separately). Softphones like MicroSIP/Zoiper avoid this by listening on
# all interfaces, which is what we replicate here.
# ---------------------------------------------------------------------------

def _patched_rtp_start(self):
    self.sin = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    self.sout = self.sin
    self.sin.bind(("0.0.0.0", self.inPort))
    self.sin.setblocking(False)

    r = threading.Timer(0, self.recv)
    r.name = "RTP Receiver"
    r.start()
    t = threading.Timer(0, self.trans)
    t.name = "RTP Transmitter"
    t.start()


RTP.RTPClient.start = _patched_rtp_start

_orig_rtp_encode_packet = RTP.RTPClient.encode_packet


def _patched_rtp_encode_packet(self, payload):
    if self.preference == RTP.PayloadType.PCMA:
        return self.encode_pcma(payload)
    return _orig_rtp_encode_packet(self, payload)


RTP.RTPClient.encode_packet = _patched_rtp_encode_packet

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# FIX 1: Teach SIPMessage parser to parse OPTIONS requests cleanly
# ---------------------------------------------------------------------------

_orig_sip_parse = SIPMessage.parse

def _patched_sip_parse(self, data):
    try:
        return _orig_sip_parse(self, data)
    except SIPParseError as e:
        raw_heading = data.split(b"\r\n", 1)[0]
        if b"OPTIONS" in raw_heading:
            lines = data.split(b"\r\n")
            parts = lines[0].split(b" ")
            self.method = parts[0].decode("utf-8", errors="ignore")
            self.request_uri = parts[1].decode("utf-8", errors="ignore")
            self.version = parts[2].decode("utf-8", errors="ignore")
            self.headers = {}
            for line in lines[1:]:
                if not line:
                    break
                if b":" in line:
                    k, v = line.split(b":", 1)
                    self.headers[k.decode("utf-8", errors="ignore").strip()] = (
                        v.decode("utf-8", errors="ignore").strip()
                    )
            return
        raise e

SIPMessage.parse = _patched_sip_parse


# ---------------------------------------------------------------------------
# FIX 2: Handle OPTIONS requests and SIP 500 responses
# ---------------------------------------------------------------------------

def _get_hdr(headers: dict, name: str) -> str:
    target = name.lower()
    for k, v in headers.items():
        if k.lower() == target:
            return v
    return ""

_orig_client_parse_message = getattr(SIPClient, "parse_message", None)


def _send_options_ok(client, message):
    headers = getattr(message, "headers", {})
    via = _get_hdr(headers, "Via")
    from_hdr = _get_hdr(headers, "From")
    to_hdr = _get_hdr(headers, "To")
    call_id = _get_hdr(headers, "Call-ID")
    cseq = _get_hdr(headers, "CSeq")

    if ";tag=" not in to_hdr.lower():
        to_hdr = f"{to_hdr};tag=ast-opt-ok"

    reply = (
        "SIP/2.0 200 OK\r\n"
        f"Via: {via}\r\n"
        f"From: {from_hdr}\r\n"
        f"To: {to_hdr}\r\n"
        f"Call-ID: {call_id}\r\n"
        f"CSeq: {cseq}\r\n"
        "User-Agent: CNETGEEK Softphone\r\n"
        "Allow: INVITE, ACK, CANCEL, OPTIONS, BYE\r\n"
        "Content-Length: 0\r\n\r\n"
    )
    client.s.sendto(reply.encode("utf-8"), (client.server, client.port))
    print("[SIP] Successfully replied 200 OK to Asterisk OPTIONS ping")


def _patched_client_parse_message(self, message):
    if getattr(message, "method", "") == "OPTIONS":
        try:
            _send_options_ok(self, message)
        except Exception as ex:
            print("[SIP] Error sending OPTIONS 200 OK:", ex)
        self.s.setblocking(True)
        return

    if getattr(message, "status", None) == SIPStatus.INTERNAL_SERVER_ERROR:
        state["call_status"] = "Call failed: SIP 500 Internal Server Error"
        broadcast_status()
        if self.callCallback is not None:
            self.callCallback(message)
        self.s.setblocking(True)
        return

    if _orig_client_parse_message:
        return _orig_client_parse_message(self, message)


if _orig_client_parse_message:
    SIPClient.parse_message = _patched_client_parse_message


_orig_phone_callback = VoIPPhone.callback


def _patched_phone_callback(self, request):
    if getattr(request, "status", None) == SIPStatus.INTERNAL_SERVER_ERROR:
        self._callback_RESP_Unavailable(request)
        return
    return _orig_phone_callback(self, request)


VoIPPhone.callback = _patched_phone_callback


# ---------------------------------------------------------------------------
# Application setup & runtime state
# ---------------------------------------------------------------------------

state = {
    "registered": False,
    "reg_status": "Not registered",
    "call_status": "Idle",
    "extension": None,
    "server": None,
    "remote_uri": None,
}

phone: Optional[VoIPPhone] = None
current_call = None
audio_thread: Optional[threading.Thread] = None
audio_stop_flag = threading.Event()
keepalive_stop_flag = threading.Event()

status_subscribers: list[tuple[WebSocket, asyncio.AbstractEventLoop]] = []
lib_lock = threading.RLock()

RATE = 8000
CHUNK = 160
GREETING = "Hello, this is Era. How can I help you?"


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    keepalive_stop_flag.set()
    audio_stop_flag.set()
    global phone
    if phone is not None:
        try:
            phone.stop()
        except Exception:
            pass


app = FastAPI(title="SIP Web Softphone (UDP)", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


def broadcast_status():
    dead = []
    for ws, loop in status_subscribers:
        try:
            asyncio.run_coroutine_threadsafe(ws.send_json(state), loop)
        except Exception:
            dead.append((ws, loop))
    for d in dead:
        if d in status_subscribers:
            status_subscribers.remove(d)


def nat_keepalive_worker(server: str, port: int):
    """Sends periodic CRLF to prevent router NAT binding expiration."""
    while not keepalive_stop_flag.is_set():
        time.sleep(15)
        if phone is not None and hasattr(phone, "sip") and hasattr(phone.sip, "s"):
            try:
                phone.sip.s.sendto(b"\r\n\r\n", (server, port))
            except Exception:
                pass


def audio_loop(call):
    pa = pyaudio.PyAudio()
    in_stream = out_stream = None
    try:
        in_stream = pa.open(format=pyaudio.paInt16, channels=1, rate=RATE,
                            input=True, frames_per_buffer=CHUNK)
        out_stream = pa.open(format=pyaudio.paInt16, channels=1, rate=RATE,
                             output=True, frames_per_buffer=CHUNK)

        while not audio_stop_flag.is_set():
            try:
                if call.state != CallState.ANSWERED:
                    break
                mic_data = in_stream.read(CHUNK, exception_on_overflow=False)
                call.write_audio(mic_data)

                recv_data = call.read_audio(CHUNK)
                if recv_data:
                    out_stream.write(recv_data)
            except InvalidStateError:
                break
            except Exception as e:
                print("audio_loop error:", e)
                break
    finally:
        for s in (in_stream, out_stream):
            if s is not None:
                try:
                    s.stop_stream()
                    s.close()
                except Exception:
                    pass
        pa.terminate()


def start_audio_bridge(call):
    global audio_thread
    audio_stop_flag.clear()
    audio_thread = threading.Thread(target=audio_loop, args=(call,), daemon=True)
    audio_thread.start()


def stop_audio_bridge():
    audio_stop_flag.set()
    if audio_thread is not None:
        audio_thread.join(timeout=2)


async def _openai_realtime_session(call, api_key):
    model = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
    voice = os.getenv("OPENAI_REALTIME_VOICE", "alloy").strip()
    try:
        speed = float(os.getenv("OPENAI_REALTIME_SPEED", "1.0"))
    except ValueError:
        speed = 1.0
    speed = min(1.5, max(0.25, speed))
    endpoint = f"wss://api.openai.com/v1/realtime?model={model}"
    headers = {
        "Authorization": f"Bearer {api_key}",
    }
    async with websockets.connect(
        endpoint, additional_headers=headers, max_size=None
    ) as websocket:
        print("[AI] OpenAI Realtime session connected")
        await websocket.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "model": model,
                "output_modalities": ["audio"],
                "instructions": (
                    "You are Era, a helpful telephone assistant. "
                    "Understand clear American English from a phone call. "
                    "Do not guess or invent words. Wait until the caller "
                    "finishes a complete sentence before answering. "
                    "Use a warm, natural, calm telephone voice with clear "
                    "pronunciation and short pauses. Speak clearly and keep "
                    "responses brief. Answer the "
                    "caller's actual question directly. If the audio is "
                    "unclear, say you did not understand and ask them to "
                    "repeat the question; never change the subject."
                ),
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        "noise_reduction": {"type": "near_field"},
                        "transcription": {
                            "model": "gpt-4o-mini-transcribe",
                            "language": "en",
                            "prompt": (
                                "Telephone support in American English. "
                                "Important terms include TP-Link, router, "
                                "reboot, restart, reset, power cycle, Wi-Fi, "
                                "modem, and internet."
                            ),
                        },
                        "turn_detection": {
                            "type": "semantic_vad",
                            "eagerness": "low",
                            "create_response": True,
                            "interrupt_response": False,
                        },
                    },
                    "output": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        "voice": voice,
                        "speed": speed,
                    },
                },
            },
        }))
        await websocket.send(json.dumps({
            "type": "response.create",
            "response": {
                "output_modalities": ["audio"],
                "instructions": "Say exactly this greeting: " + GREETING,
            },
        }))

        # Do not let audio left by a previous turn play into this session.
        for rtp_client in call.RTPClients:
            rtp_client.pmin = RTP.RTPPacketManager()
            rtp_client.pmout = RTP.RTPPacketManager()

        playback_queue = asyncio.Queue(maxsize=100)
        playback_remainder = b""
        agent_speaking = asyncio.Event()

        async def play_agent_audio():
            while call.state == CallState.ANSWERED:
                pcm_chunk = await playback_queue.get()
                agent_speaking.set()
                await asyncio.to_thread(call.write_audio, pcm_chunk)
                await asyncio.sleep(CHUNK / RATE)
                if playback_queue.empty():
                    agent_speaking.clear()

        def clear_playback():
            while True:
                try:
                    playback_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            for rtp_client in call.RTPClients:
                rtp_client.pmout = RTP.RTPPacketManager()

        async def send_caller_audio():
            rate_state = None
            audio_chunks = 0
            while call.state == CallState.ANSWERED:
                pcm_8khz_unsigned = await asyncio.to_thread(
                    call.read_audio, CHUNK, True
                )
                audio_chunks += 1
                if agent_speaking.is_set():
                    # Drain the RTP input while the agent speaks, but do not
                    # feed handset/speaker echo back into the model.
                    pcm_8khz_unsigned = b"\x80" * len(pcm_8khz_unsigned)
                pcm_8khz_signed = audioop.bias(pcm_8khz_unsigned, 1, -128)
                pcm_8khz_16bit = audioop.lin2lin(pcm_8khz_signed, 1, 2)
                pcm_24khz, rate_state = audioop.ratecv(
                    pcm_8khz_16bit, 2, 1, RATE, 24000, rate_state
                )
                await websocket.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(pcm_24khz).decode("ascii"),
                }))
                if audio_chunks % 50 == 0:
                    print(f"[AI] Caller RTP audio sent: {audio_chunks} chunks")

        async def receive_agent_audio():
            nonlocal playback_remainder
            rate_state = None
            response_audio_active = False
            while call.state == CallState.ANSWERED:
                message = json.loads(await websocket.recv())
                event_type = message.get("type", "")
                if event_type == "conversation.item.input_audio_transcription.completed":
                    print("[AI] Caller:", message.get("transcript", ""))
                elif event_type == "response.output_audio_transcript.done":
                    print("[AI] Agent:", message.get("transcript", ""))
                elif event_type == "error":
                    raise RuntimeError(f"OpenAI error: {message.get('error')}")
                elif event_type == "response.output_audio.delta":
                    if not response_audio_active:
                        # Each response is an independent PCM stream. Reusing
                        # the previous resampler state causes boundary clicks.
                        rate_state = None
                        response_audio_active = True
                    pcm_24khz = base64.b64decode(message["delta"])
                    pcm_8khz_16bit, rate_state = audioop.ratecv(
                        pcm_24khz, 2, 1, 24000, RATE, rate_state
                    )
                    pcm_8khz_signed = audioop.lin2lin(pcm_8khz_16bit, 2, 1)
                    pcm_8khz_unsigned = audioop.bias(pcm_8khz_signed, 1, 128)
                    playback_remainder += pcm_8khz_unsigned
                    while len(playback_remainder) >= CHUNK:
                        await playback_queue.put(playback_remainder[:CHUNK])
                        playback_remainder = playback_remainder[CHUNK:]
                elif event_type == "response.output_audio.done":
                    if playback_remainder:
                        await playback_queue.put(
                            playback_remainder.ljust(CHUNK, b"\x80")
                        )
                        playback_remainder = b""
                    rate_state = None
                    response_audio_active = False

        await asyncio.gather(
            send_caller_audio(), receive_agent_audio(), play_agent_audio()
        )


def start_openai_agent(call):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[AI] OPENAI_API_KEY is not configured; AI agent skipped")
        return
    try:
        asyncio.run(_openai_realtime_session(call, api_key))
    except Exception as ex:
        print("[AI] OpenAI Realtime agent failed:", ex)


def answer_with_ai(call):
    try:
        call.answer()
        state["call_status"] = "AI agent connected"
        broadcast_status()
        threading.Thread(target=start_openai_agent, args=(call,), daemon=True).start()
    except InvalidStateError:
        return
    except Exception as ex:
        print("[AI] Could not answer incoming call:", ex)


def incoming_call_callback(call):
    global current_call
    current_call = call
    for rtp_client in getattr(call, "RTPClients", []):
        print(
            "[SIP] RTP media endpoint: "
            f"local={rtp_client.inIP}:{rtp_client.inPort}, "
            f"remote={rtp_client.outIP}:{rtp_client.outPort}, "
            f"codecs={list(rtp_client.assoc.values())}"
        )
    try:
        remote = call.request.headers.get("From", {}).get("number", "unknown")
    except Exception:
        remote = "unknown"
    state["call_status"] = "Ringing (incoming)"
    state["remote_uri"] = str(remote)
    broadcast_status()
    threading.Thread(target=watch_call_end, args=(call,), daemon=True).start()
    threading.Thread(target=answer_with_ai, args=(call,), daemon=True).start()


class RegisterRequest(BaseModel):
    extension: str
    password: str
    server: str
    port: int = 5060
    my_ip: Optional[str] = None


class DialRequest(BaseModel):
    number: str


def watch_call_end(call):
    global current_call
    try:
        while call.state != CallState.ENDED:
            time.sleep(0.2)
    except Exception as ex:
        print("call state watcher error:", ex)
        return

    if current_call is not call:
        return
    stop_audio_bridge()
    current_call = None
    state["call_status"] = "Idle"
    state["remote_uri"] = None
    broadcast_status()


def detect_local_ip(target_server: str) -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((target_server, 5060))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.post("/api/register")
def register(req: RegisterRequest):
    global phone
    with lib_lock:
        if phone is not None:
            keepalive_stop_flag.set()
            try:
                phone.stop()
            except Exception:
                pass
            phone = None

        my_ip = req.my_ip or detect_local_ip(req.server)

        try:
            phone = VoIPPhone(
                req.server,
                req.port,
                req.extension,
                req.password,
                myIP=my_ip,
                callCallback=incoming_call_callback,
            )
            phone.start()

            keepalive_stop_flag.clear()
            threading.Thread(
                target=nat_keepalive_worker,
                args=(req.server, req.port),
                daemon=True
            ).start()

        except Exception as e:
            return {"ok": False, "error": str(e)}

        state["extension"] = req.extension
        state["server"] = f"{req.server}:{req.port}"

    time.sleep(1.0)
    state["registered"] = True
    state["reg_status"] = "Registered"
    broadcast_status()
    return {"ok": True}


@app.post("/api/unregister")
def unregister():
    global phone
    with lib_lock:
        keepalive_stop_flag.set()
        if phone is not None:
            try:
                phone.stop()
            except Exception as e:
                return {"ok": False, "error": str(e)}
            phone = None
    state["registered"] = False
    state["reg_status"] = "Unregistered"
    broadcast_status()
    return {"ok": True}


@app.post("/api/dial")
def dial(req: DialRequest):
    global current_call
    if phone is None:
        return {"ok": False, "error": "Not registered yet"}
    with lib_lock:
        try:
            call = phone.call(req.number)
            current_call = call
        except Exception as e:
            return {"ok": False, "error": str(e)}

    state["call_status"] = f"Calling {req.number}..."
    state["remote_uri"] = req.number
    broadcast_status()

    def watch():
        try:
            while call.state in (CallState.DIALING, CallState.RINGING):
                time.sleep(0.2)
            if call.state == CallState.ANSWERED:
                state["call_status"] = "Connected"
                broadcast_status()
                start_audio_bridge(call)
            threading.Thread(
                target=watch_call_end, args=(call,), daemon=True
            ).start()
        except Exception as e:
            print("watch error:", e)

    threading.Thread(target=watch, daemon=True).start()
    return {"ok": True}


@app.post("/api/answer")
def answer():
    global current_call
    if current_call is None:
        return {"ok": False, "error": "No incoming call"}
    with lib_lock:
        try:
            current_call.answer()
        except Exception as e:
            return {"ok": False, "error": str(e)}
    state["call_status"] = "Connected"
    broadcast_status()
    start_audio_bridge(current_call)
    return {"ok": True}


@app.post("/api/hangup")
def hangup():
    global current_call
    if current_call is None:
        return {"ok": False, "error": "No active call"}
    with lib_lock:
        try:
            current_call.hangup()
        except InvalidStateError:
            pass
        except Exception as e:
            return {"ok": False, "error": str(e)}
    stop_audio_bridge()
    current_call = None
    state["call_status"] = "Idle"
    state["remote_uri"] = None
    broadcast_status()
    return {"ok": True}


@app.post("/api/dtmf/{digit}")
def send_dtmf(digit: str):
    if current_call is None:
        return {"ok": False, "error": "No active call"}
    with lib_lock:
        try:
            if hasattr(current_call, "send_dtmf"):
                current_call.send_dtmf(digit)
            elif hasattr(current_call, "dtmf"):
                current_call.dtmf(digit)
            else:
                return {"ok": False, "error": "This pyVoIP version has no DTMF method"}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    return {"ok": True}


@app.get("/api/status")
def get_status():
    return state


@app.websocket("/ws/status")
async def ws_status(websocket: WebSocket):
    await websocket.accept()
    loop = asyncio.get_event_loop()
    status_subscribers.append((websocket, loop))
    try:
        await websocket.send_json(state)
        while True:
            await asyncio.sleep(5)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        if (websocket, loop) in status_subscribers:
            status_subscribers.remove((websocket, loop))
