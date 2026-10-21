/* Voice in and out that works beyond Chrome: record with MediaRecorder and let the server transcribe (/api/stt),
   and read answers with the server's voice (/api/tts), falling back to the browser's own Persian voice. */

export type VoiceError = { message: string };

const MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

export function canRecord(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.MediaRecorder !== "undefined";
}

/** Starts recording right away; `stop()` resolves with the audio. Stops by itself after `maxMs`. */
export async function startRecording(maxMs = 15000, onAutoStop?: () => void): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
  if (!canRecord()) throw { message: "این مرورگر به میکروفون دسترسی نمی‌دهد؛ لینک را در کروم یا سافاری باز کنید یا تایپ کنید" } as VoiceError;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e: any) {
    const name = e?.name;
    throw {
      message: name === "NotAllowedError" || name === "SecurityError"
        ? "اجازهٔ میکروفون داده نشده؛ از تنظیمات مرورگر اجازه بدهید یا تایپ کنید"
        : name === "NotFoundError" ? "میکروفونی پیدا نشد؛ لطفاً تایپ کنید" : "میکروفون باز نشد؛ لطفاً تایپ کنید",
    } as VoiceError;
  }
  const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported?.(m));
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }));
    };
  });
  rec.start();
  const timer = window.setTimeout(() => {
    if (rec.state === "recording") {
      rec.stop();
      onAutoStop?.();
    }
  }, maxMs);
  return {
    stop: () => {
      window.clearTimeout(timer);
      if (rec.state === "recording") rec.stop();
      return done;
    },
    cancel: () => {
      window.clearTimeout(timer);
      rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
      if (rec.state === "recording") rec.stop();
    },
  };
}

export async function transcribe(audio: Blob): Promise<string> {
  if (audio.size < 1200) throw { message: "صدایی ضبط نشد؛ دوباره میکروفون را بزنید و حرف بزنید" } as VoiceError;
  const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
  const fd = new FormData();
  fd.append("audio", audio, `voice.${ext}`);
  fd.append("lang", "fa");
  let r: Response;
  try {
    r = await fetch("/api/stt", { method: "POST", body: fd });
  } catch {
    throw { message: "ارتباط با سرور برقرار نشد؛ دوباره امتحان کنید یا تایپ کنید" } as VoiceError;
  }
  if (r.status === 413) throw { message: "صدا خیلی طولانی بود؛ کوتاه‌تر بگویید" } as VoiceError;
  if (r.status === 415) throw { message: "این مرورگر صدا را در قالبی ضبط کرد که پشتیبانی نمی‌شود؛ لطفاً تایپ کنید" } as VoiceError;
  if (!r.ok) throw { message: "تبدیل صدا به متن الان در دسترس نیست؛ لطفاً تایپ کنید" } as VoiceError;
  const text = ((await r.json()).text ?? "").trim();
  if (!text) throw { message: "حرفی تشخیص داده نشد؛ دوباره بگویید" } as VoiceError;
  return text;
}

/* ---------------- speaking ---------------- */

let player: HTMLAudioElement | null = null;
let current: { id: string; url?: string; onEnd: () => void } | null = null;

/** 0.1 s of silence as a WAV blob URL: a valid source to "play" inside a tap. */
let silence: string | null = null;
function silentWav(): string {
  if (silence) return silence;
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
  silence = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return silence;
}

/** Call inside a tap so a reply that arrives seconds later may still play (mobile autoplay rules). */
export function unlockAudio() {
  stopSpeaking(); // a new question interrupts the answer being read
  if (!player) player = new Audio();
  player.muted = true;
  player.src = silentWav();
  player.play().then(() => { player!.pause(); player!.muted = false; }).catch(() => { player!.muted = false; });
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* no speech synthesis */
  }
}

/** Trim to whole sentences under ~600 characters, the way a person would read the answer. */
export function speakable(text: string, max = 600): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("؟"), cut.lastIndexOf("!"), cut.lastIndexOf("؛"));
  return end > 120 ? cut.slice(0, end + 1) : cut;
}

export function stopSpeaking() {
  if (player) player.pause();
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
  if (current) {
    if (current.url) URL.revokeObjectURL(current.url);
    const end = current.onEnd;
    current = null;
    end();
  }
}

export function speakingId(): string | null {
  return current?.id ?? null;
}

/** True when the browser itself can speak Persian (some Android phones), so answers can be read without the server. */
export function browserSpeaksPersian(): boolean {
  return !!browserVoice();
}

function browserVoice(): SpeechSynthesisVoice | null {
  try {
    return window.speechSynthesis?.getVoices().find((v) => v.lang?.toLowerCase().startsWith("fa")) ?? null;
  } catch {
    return null;
  }
}

/** Reads `text` aloud: the server's voice first, then the browser's Persian voice. Rejects when neither exists. */
export async function speak(id: string, text: string, onEnd: () => void): Promise<void> {
  stopSpeaking();
  current = { id, onEnd };
  const mine = current;
  const finish = () => {
    if (current === mine) {
      if (mine.url) URL.revokeObjectURL(mine.url);
      current = null;
      onEnd();
    }
  };
  try {
    const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: speakable(text) }) });
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    if (current !== mine) return; // stopped while loading
    if (!player) player = new Audio();
    mine.url = URL.createObjectURL(blob);
    player.src = mine.url;
    player.onended = finish;
    player.onerror = finish;
    await player.play();
    return;
  } catch {
    if (current !== mine) return;
  }
  const v = browserVoice();
  if (!v) {
    current = null;
    throw { message: "پخش صوتی جواب الان در دسترس نیست" } as VoiceError;
  }
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.voice = v;
  u.lang = v.lang;
  u.rate = 1;
  u.onend = finish;
  u.onerror = finish;
  window.speechSynthesis.speak(u);
}
