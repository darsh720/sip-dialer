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
import re
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
        headers = getattr(message, "headers", {}) or {}
        reason = _get_hdr(headers, "Reason") or _get_hdr(headers, "Warning")
        detail = f" ({reason})" if reason else ""
        state["call_status"] = f"Call failed: SIP 500 Internal Server Error{detail}"
        print(f"[SIP] PBX rejected call with SIP 500{detail}: {message.summary()}")
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
# FIX 4: Handle 407 Proxy Authentication Required for Asterisk outgoing calls
# ---------------------------------------------------------------------------

_orig_sip_parse_header = SIPMessage.parse_header

def _patched_sip_parse_header(self, header, data):
    if header in ("Proxy-Authenticate", "Proxy-Authorization", "WWW-Authenticate", "Authorization"):
        cleaned = data.replace("Digest ", "")
        row_data = self.auth_match.findall(cleaned)
        header_data = {}
        for var, val in row_data:
            header_data[var] = val.strip('"')
        self.headers[header] = header_data
        self.authentication = header_data
        return
    return _orig_sip_parse_header(self, header, data)

SIPMessage.parse_header = _patched_sip_parse_header

_orig_sip_client_invite = SIPClient.invite

def _patched_sip_client_invite(self, number: str, ms, sendtype):
    branch = "z9hG4bK" + self.gen_call_id()[0:25]
    call_id = self.gen_call_id()
    sess_id = self.sessID.next()
    invite = self.gen_invite(number, str(sess_id), ms, sendtype, branch, call_id)
    with self.recvLock:
        self.out.sendto(invite.encode("utf8"), (self.server, self.port))
        response = SIPMessage(self.s.recv(8192))

        while (
            response.status not in (SIPStatus(401), SIPStatus(407), SIPStatus(100), SIPStatus(180))
        ) or response.headers.get("Call-ID") != call_id:
            if not self.NSD:
                break
            self.parse_message(response)
            response = SIPMessage(self.s.recv(8192))

        if response.status in (SIPStatus(100), SIPStatus(180)):
            return SIPMessage(invite.encode("utf8")), call_id, sess_id

        ack = self.gen_ack(response)
        self.out.sendto(ack.encode("utf8"), (self.server, self.port))

        authhash = self.gen_authorization(response)
        auth_info = getattr(response, "authentication", {}) or {}
        nonce = auth_info.get("nonce", "")
        realm = auth_info.get("realm", "")
        hdr_name = "Proxy-Authorization" if response.status == SIPStatus(407) else "Authorization"
        auth = (
            f'{hdr_name}: Digest username="{self.username}",realm='
            + f'"{realm}",nonce="{nonce}",uri="sip:{self.server};'
            + f'transport=UDP",response="{str(authhash, "utf8")}",'
            + "algorithm=MD5\r\n"
        )

        invite = self.gen_invite(number, str(sess_id), ms, sendtype, branch, call_id)
        invite = invite.replace("\r\nContent-Length", f"\r\n{auth}Content-Length")
        self.out.sendto(invite.encode("utf8"), (self.server, self.port))
        return SIPMessage(invite.encode("utf8")), call_id, sess_id

SIPClient.invite = _patched_sip_client_invite


# ---------------------------------------------------------------------------
# Department Normalization & Profile Persistence
# ---------------------------------------------------------------------------

PROFILE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hotel_profile.json")

def load_persisted_profile() -> dict:
    if os.path.exists(PROFILE_FILE):
        try:
            with open(PROFILE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            print("[PROFILE] Error loading hotel_profile.json:", e)
    return {}

def save_persisted_profile(profile_data: dict, tenant_id: Optional[str] = None):
    try:
        to_save = {
            "tenant_id": tenant_id or state.get("tenant_id") or "1000",
            "hotel_profile": profile_data or {},
            "updated_at": time.time(),
        }
        with open(PROFILE_FILE, "w", encoding="utf-8") as f:
            json.dump(to_save, f, indent=2)
        depts = profile_data.get("departmentExtensions", {}) if isinstance(profile_data, dict) else {}
        print(f"[PROFILE] Saved hotel profile ({len(depts)} departments) to {PROFILE_FILE}")
    except Exception as e:
        print("[PROFILE] Error saving hotel_profile.json:", e)

def normalize_department(dept: str) -> str:
    cleaned = re.sub(r"[_\s\-]+", "", (dept or "").lower())
    mapping = {
        "frontdesk": "frontDesk",
        "front": "frontDesk",
        "reception": "frontDesk",
        "receptionist": "frontDesk",
        "operator": "frontDesk",
        "human": "frontDesk",
        "desk": "frontDesk",
        "ringgroup": "ringGroup",
        "ring": "ringGroup",
        "group": "ringGroup",
        "sales": "sales",
        "gm": "gm",
        "generalmanager": "gm",
        "manager": "gm",
        "laundry": "laundry",
        "lobby": "lobby",
        "fitness": "fitness",
        "gym": "fitness",
        "pool": "pool",
        "swimmingpool": "pool",
        "elevator": "elevator",
        "lift": "elevator",
        "meetingroom": "meetingRoom",
        "meeting": "meetingRoom",
        "mettingroom": "meetingRoom",
        "maintenanceroom": "maintenanceRoom",
        "maintenance": "maintenanceRoom",
        "maintenace": "maintenanceRoom",
        "maintenaceroom": "maintenanceRoom",
        "office": "office",
        "agm": "agm",
        "assistantgeneralmanager": "agm",
        "assistantgm": "agm",
        "businesscenter": "businessCenter",
        "busineecenter": "businessCenter",
        "business": "businessCenter",
    }
    return mapping.get(cleaned, dept)


# ---------------------------------------------------------------------------
# Application setup & runtime state
# ---------------------------------------------------------------------------

_initial_profile = load_persisted_profile()

state = {
    "registered": False,
    "reg_status": "Not registered",
    "call_status": "Idle",
    "extension": None,
    "server": None,
    "remote_uri": None,
    "tenant_id": _initial_profile.get("tenant_id", "1000"),
    "hotel_profile": _initial_profile.get("hotel_profile", {}),
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
    hotel_profile = state.get("hotel_profile") or {}
    profile_lines = [
        f"- {key}: {value}"
        for key, value in hotel_profile.items()
        if value not in (None, "", [], {})
    ]
    hotel_context = "\n".join(profile_lines) or "- No hotel profile has been provided."
    department_extensions = hotel_profile.get("departmentExtensions", {})
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
                    "You are Era, the telephone receptionist for this specific hotel. "
                    "Answer every hotel question using only the tenant hotel profile below. "
                    "Never ask which hotel the caller means because this call is already for "
                    "the configured hotel. Give the exact saved value when it is available. "
                    "If the profile does not contain the requested information, say that you "
                    "do not have that information and offer to connect the caller to the front desk. "
                    "When the caller asks to speak to a department or person, use the transfer "
                    "tool immediately. A department is available when its extension is present. "
                    "For Front Desk, try Front Desk first and use Ring Group if Front Desk is empty. "
                    "Do not read extension numbers to the caller.\n"
                    "Do not invent, infer, or substitute details from another hotel.\n\n"
                    "TENANT HOTEL PROFILE:\n"
                    + hotel_context + "\n\n"
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
                "tools": [{
                    "type": "function",
                    "name": "transfer_to_department",
                    "description": "Transfer the caller to a configured hotel department extension.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "department": {
                                "type": "string",
                                "enum": [
                                    "frontDesk", "ringGroup", "sales", "gm", "laundry",
                                    "lobby", "fitness", "pool", "elevator", "meetingRoom",
                                    "maintenanceRoom", "office", "agm", "businessCenter"
                                ]
                            }
                        },
                        "required": ["department"]
                    }
                }],
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

        playback_queue = asyncio.Queue(maxsize=500)
        playback_remainder = b""
        transfer_requested = asyncio.Event()
        # Track how many audio chunks are queued/in-flight so the echo
        # suppression flag doesn't flicker on brief gaps between bursts.
        _agent_audio_inflight = 0
        agent_speaking = asyncio.Event()

        async def transfer_to_department(department):
            # Always read live from state so updated extensions are used
            department = normalize_department(department)
            live_extensions = (state.get("hotel_profile") or {}).get("departmentExtensions", {})
            targets = [live_extensions.get(department, "")]
            if department == "frontDesk":
                targets.append(live_extensions.get("ringGroup", ""))
            targets = list(dict.fromkeys(str(target).strip() for target in targets if str(target).strip()))
            print(f"[TRANSFER] dept={department} targets={targets} live_extensions={live_extensions}")
            if not targets:
                return False, "That department is not configured. Offer the caller the front desk instead."
            failures = []
            for target in targets:
                try:
                    print(f"[TRANSFER] Attempting transfer to {target}")
                    # Stop the AI RTP tasks before the transfer bridge owns the call media.
                    transfer_requested.set()
                    clear_playback()
                    await asyncio.sleep(0.1)
                    await asyncio.to_thread(start_call_transfer, call, target)
                    return True, f"The caller was transferred to {department}."
                except Exception as ex:
                    print(f"[TRANSFER] Failed for {target}: {ex}")
                    transfer_requested.clear()
                    failures.append(str(ex))
            return False, "Nobody is available in that department right now. Offer to take a message."

        async def play_agent_audio():
            nonlocal _agent_audio_inflight
            while call.state == CallState.ANSWERED:
                if transfer_requested.is_set():
                    break
                try:
                    pcm_chunk = await asyncio.wait_for(playback_queue.get(), timeout=0.2)
                except asyncio.TimeoutError:
                    continue
                agent_speaking.set()
                # write_audio paces itself via the RTP transmitter timing;
                # no extra sleep is needed (the old asyncio.sleep(CHUNK/RATE)
                # was doubling latency and creating audible gaps).
                await asyncio.to_thread(call.write_audio, pcm_chunk)
                _agent_audio_inflight = max(0, _agent_audio_inflight - 1)
                if _agent_audio_inflight == 0 and playback_queue.empty():
                    agent_speaking.clear()

        def clear_playback():
            nonlocal _agent_audio_inflight
            while True:
                try:
                    playback_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            _agent_audio_inflight = 0
            agent_speaking.clear()
            for rtp_client in call.RTPClients:
                rtp_client.pmout = RTP.RTPPacketManager()

        async def send_caller_audio():
            rate_state = None
            audio_chunks = 0
            while call.state == CallState.ANSWERED:
                if transfer_requested.is_set():
                    break
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
                # Yield to the event loop so playback and receiver tasks
                # get prompt scheduling even under heavy caller audio load.
                await asyncio.sleep(0)

        async def receive_agent_audio():
            nonlocal playback_remainder, _agent_audio_inflight
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
                elif event_type == "response.function_call_arguments.done":
                    if message.get("name") == "transfer_to_department":
                        arguments = json.loads(message.get("arguments", "{}"))
                        transferred, result = await transfer_to_department(arguments.get("department", ""))
                        await websocket.send(json.dumps({
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": message.get("call_id"),
                                "output": result,
                            },
                        }))
                        if transferred:
                            return
                        await websocket.send(json.dumps({"type": "response.create"}))
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
                        chunk_to_queue = playback_remainder[:CHUNK]
                        playback_remainder = playback_remainder[CHUNK:]
                        try:
                            playback_queue.put_nowait(chunk_to_queue)
                            _agent_audio_inflight += 1
                        except asyncio.QueueFull:
                            # Queue overflow — drop oldest chunk to keep
                            # playback current rather than stalling the
                            # WebSocket receiver (which would cascade into
                            # starving ALL audio paths).
                            try:
                                playback_queue.get_nowait()
                                _agent_audio_inflight = max(0, _agent_audio_inflight - 1)
                            except asyncio.QueueEmpty:
                                pass
                            playback_queue.put_nowait(chunk_to_queue)
                            _agent_audio_inflight += 1
                elif event_type == "response.output_audio.done":
                    if playback_remainder:
                        padded = playback_remainder.ljust(CHUNK, b"\x80")
                        try:
                            playback_queue.put_nowait(padded)
                            _agent_audio_inflight += 1
                        except asyncio.QueueFull:
                            try:
                                playback_queue.get_nowait()
                                _agent_audio_inflight = max(0, _agent_audio_inflight - 1)
                            except asyncio.QueueEmpty:
                                pass
                            playback_queue.put_nowait(padded)
                            _agent_audio_inflight += 1
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
    tenant_id: Optional[str] = None
    hotel_profile: Optional[dict] = None


class DialRequest(BaseModel):
    number: str


class ProfileUpdateRequest(BaseModel):
    tenant_id: Optional[str] = None
    hotel_profile: dict


def start_call_transfer(source_call, target_number: str):
    """Bridge the answered caller to a configured hotel extension."""
    if phone is None:
        raise RuntimeError("The SIP phone is no longer registered")

    with lib_lock:
        target_call = phone.call(target_number)

    state["call_status"] = f"Transferring to {target_number}..."
    state["remote_uri"] = target_number
    broadcast_status()

    deadline = time.monotonic() + 30
    while target_call.state in (CallState.DIALING, CallState.RINGING):
        if time.monotonic() >= deadline:
            try:
                target_call.hangup()
            except Exception:
                pass
            raise RuntimeError(f"Transfer target {target_number} did not answer")
        time.sleep(0.2)

    if target_call.state != CallState.ANSWERED:
        raise RuntimeError(f"Transfer target {target_number} failed with state: {target_call.state}")

    state["call_status"] = f"Connected to {target_number}"
    broadcast_status()

    def forward_audio(read_call, write_call):
        try:
            while source_call.state == CallState.ANSWERED and target_call.state == CallState.ANSWERED:
                write_call.write_audio(read_call.read_audio(CHUNK, True))
        except Exception as ex:
            print("transfer audio error:", ex)

    threads = [
        threading.Thread(target=forward_audio, args=(source_call, target_call), daemon=True),
        threading.Thread(target=forward_audio, args=(target_call, source_call), daemon=True),
    ]
    for thread in threads:
        thread.start()
    while source_call.state == CallState.ANSWERED and target_call.state == CallState.ANSWERED:
        time.sleep(0.2)

    try:
        if source_call.state != CallState.ENDED:
            source_call.hangup()
    except Exception:
        pass
    try:
        if target_call.state != CallState.ENDED:
            target_call.hangup()
    except Exception:
        pass


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
        state["tenant_id"] = req.tenant_id
        state["hotel_profile"] = req.hotel_profile or {}

    time.sleep(1.0)
    state["registered"] = True
    state["reg_status"] = "Registered"
    broadcast_status()
    return {"ok": True}


@app.get("/api/profile")
def get_profile():
    return {
        "ok": True,
        "tenant_id": state.get("tenant_id"),
        "hotel_profile": state.get("hotel_profile", {}),
    }


@app.post("/api/profile")
def update_profile(req: ProfileUpdateRequest):
    if req.tenant_id:
        state["tenant_id"] = req.tenant_id
    state["hotel_profile"] = req.hotel_profile
    save_persisted_profile(req.hotel_profile, req.tenant_id)
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
    if current_call is not None:
        return {"ok": False, "error": "A call is already active"}
    with lib_lock:
        try:
            call = phone.call(req.number)
            current_call = call
        except Exception as e:
            state["call_status"] = f"Call failed: {e}"
            broadcast_status()
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
            elif call.state != CallState.ENDED:
                state["call_status"] = f"Call ended ({call.state})"
                broadcast_status()
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
