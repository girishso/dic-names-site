// Thin wrapper around the browser's speech recognition.
//
// Chrome on Android marks a result as final and stops by itself on silence.
// Safari on iPhone often does neither: results stay "interim" and it keeps
// listening. So this wrapper keeps whatever was heard last, final or not, and
// stops the recognition itself after a short silence.

const MAXIMUM_ALTERNATIVES = 3;
const DEFAULT_SILENCE_AFTER_SPEECH_MILLISECONDS = 3000;
const DEFAULT_NO_SPEECH_LIMIT_MILLISECONDS = 10000;

function recognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechSupported() {
  return recognitionConstructor() !== null;
}

const ERROR_MESSAGES = {
  'audio-capture': 'No microphone found.',
  'not-allowed': 'Microphone or speech permission was refused. Allow it in the browser settings.',
  'service-not-allowed':
    'Speech recognition is switched off. On iPhone, turn on Dictation in Settings, General, Keyboard.',
  network: 'Speech recognition needs an internet connection.',
  'language-not-supported': 'This language is not supported for speech on this phone. Try the other language.',
};

// Everything heard so far, as alternative hearings with the most likely first.
function hearingsFrom(results) {
  const segments = Array.from(results);
  if (segments.length === 0) return [];
  if (segments.length === 1) {
    return Array.from(segments[0], (alternative) => alternative.transcript.trim());
  }
  // Several segments of one utterance: join the best hearing of each.
  return [segments.map((segment) => segment[0].transcript.trim()).join(' ')];
}

// Listens for one utterance. `finished` resolves with the alternative hearings,
// most likely first, or with an empty list if nothing was heard.
export function listenOnce({
  language,
  onInterimText,
  silenceAfterSpeechMilliseconds = DEFAULT_SILENCE_AFTER_SPEECH_MILLISECONDS,
  noSpeechLimitMilliseconds = DEFAULT_NO_SPEECH_LIMIT_MILLISECONDS,
}) {
  const Recognition = recognitionConstructor();
  const recognition = new Recognition();
  recognition.lang = language;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = MAXIMUM_ALTERNATIVES;

  let latestHearings = [];
  let errorMessage = '';
  let silenceTimer = null;

  function stopAfter(milliseconds) {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => recognition.stop(), milliseconds);
  }

  const finished = new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      const hearings = hearingsFrom(event.results).filter(Boolean);
      if (hearings.length === 0) return;
      latestHearings = hearings;
      onInterimText?.(hearings[0]);
      stopAfter(silenceAfterSpeechMilliseconds);
    };
    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are not failures: whatever was heard stands.
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      errorMessage = ERROR_MESSAGES[event.error] ?? `Speech recognition failed (${event.error}).`;
    };
    recognition.onend = () => {
      clearTimeout(silenceTimer);
      if (errorMessage && latestHearings.length === 0) reject(new Error(errorMessage));
      else resolve([...new Set(latestHearings)]);
    };
  });

  recognition.start();
  stopAfter(noSpeechLimitMilliseconds);
  return { finished, stop: () => recognition.stop() };
}
