// Thin wrapper around the browser's speech recognition (Chrome on Android).

const MAXIMUM_ALTERNATIVES = 3;

function recognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechSupported() {
  return recognitionConstructor() !== null;
}

const ERROR_MESSAGES = {
  'no-speech': 'Nothing was heard. Tap and try again.',
  'audio-capture': 'No microphone found.',
  'not-allowed': 'Microphone permission was refused. Allow it in the browser settings.',
  'service-not-allowed': 'Speech recognition is not allowed on this page.',
  network: 'Speech recognition needs an internet connection.',
  'language-not-supported': 'This language is not supported for speech on this phone.',
};

// Listens for one utterance. `finished` resolves with the alternative hearings,
// most likely first, or with an empty list if the listening was stopped early.
export function listenOnce({ language, onInterimText }) {
  const Recognition = recognitionConstructor();
  const recognition = new Recognition();
  recognition.lang = language;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = MAXIMUM_ALTERNATIVES;

  let finalAlternatives = [];
  let errorMessage = '';

  const finished = new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      const latestResult = event.results[event.results.length - 1];
      if (latestResult.isFinal) {
        finalAlternatives = Array.from(latestResult, (alternative) => alternative.transcript.trim())
          .filter(Boolean);
      } else {
        onInterimText?.(latestResult[0].transcript);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      errorMessage = ERROR_MESSAGES[event.error] ?? `Speech recognition failed (${event.error}).`;
    };
    recognition.onend = () => {
      if (errorMessage) reject(new Error(errorMessage));
      else resolve([...new Set(finalAlternatives)]);
    };
  });

  recognition.start();
  return { finished, stop: () => recognition.stop() };
}
