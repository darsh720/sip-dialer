# SIP Web Softphone — Plain UDP version

Registers a real SIP extension over **plain UDP** — no WSS, no
Asterisk config changes, and no C++/SWIG compiling. Uses
[pyVoIP](https://github.com/tayler6000/pyVoIP), a pure-Python SIP/RTP
stack, instead of PJSIP.

```
[Browser: dial pad UI]  <-- HTTP/WS -->  [FastAPI + pyVoIP, on Ubuntu]  <-- SIP/RTP (UDP) -->  [Asterisk]
                                                    |
                                          Uses the PC's mic/speakers via PyAudio
```

## 1. Install (a few minutes, no source builds)

```bash
sudo apt update
sudo apt install -y portaudio19-dev python3-venv

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 2. Run it

```bash
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Open `http://<ubuntu-pc-ip>:8000` in a browser. Enter extension,
password, and your Asterisk server IP, hit **Register** — this is
dynamic, register a different extension any time by resubmitting
the form.

### OpenAI voice settings

The voice can be changed in `.env` without editing Python:

```dotenv
OPENAI_REALTIME_VOICE=alloy
OPENAI_REALTIME_SPEED=1.0
```

Available built-in voices include `alloy`, `ash`, `ballad`, `coral`,
`echo`, `sage`, `shimmer`, `verse`, `marin`, and `cedar`. `alloy`,
`marin`, and `cedar` are good starting points for telephone speech.

Nothing needs to change on the Asterisk side — a normal PJSIP/chan_sip
extension configured for plain UDP already works, exactly like it
does for MicroSIP or Zoiper.

## Known rough edges (please read before reporting something as broken)

pyVoIP is much lighter-weight than PJSIP, and its public API has
shifted between releases. This is written against **pyVoIP 1.6.3**
(pinned in `requirements.txt`). If you hit an `AttributeError` on a
call like `call.write_audio(...)`, `call.read_audio(...)`, or the
DTMF method, that almost always means your installed version renamed
something. Check what's actually available with:

```bash
python3 -c "from pyVoIP.VoIP import VoIPCall; print([m for m in dir(VoIPCall) if not m.startswith('_')])"
```

...and I can adjust `app.py` to match once you tell me what that
prints.

- **Registration confirmation:** pyVoIP doesn't emit a clean
  "registered" event the way PJSIP does, so the backend currently just
  waits ~1 second after calling `phone.start()` and assumes success. If
  registration actually failed (wrong password, unreachable server),
  you may see "Registered" briefly before calls simply fail — check the
  terminal running uvicorn for pyVoIP's own log output, which is more
  reliable than the UI status for diagnosing that case.
- **Audio quality/codec:** pyVoIP negotiates basic codecs (typically
  PCMU/PCMA — G.711). If your Asterisk extension's `allow=` line
  doesn't include one of those, calls may connect with no audio.
  Add `allow=ulaw` (and/or `alaw`) to the extension if needed.
- **One extension per running instance**, same as before — registering
  a new one tears down the previous session.
- **`myIP` auto-detection:** the backend guesses your Ubuntu PC's LAN
  IP by opening a dummy UDP socket toward the Asterisk server. If
  you're behind multiple NICs/VPNs and it guesses wrong, pass it
  explicitly by adding `"my_ip": "1.2.3.4"` to the register request
  (the current UI doesn't have a field for this — say so and I'll add
  one).
- **No login/auth** on this app itself — fine on a trusted LAN, put it
  behind a VPN or add auth before exposing it more broadly.