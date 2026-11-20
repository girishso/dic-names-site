// Thin wrapper around the browser's speech recognition.
//
// Browsers disagree about when one utterance is over. Chrome on Android ends
// the recognition after a very short pause, often between the name and the
// number. Safari on iPhone often never ends it and never marks a result as
// final. So this wrapper decides for itself: it keeps whatever was heard last,
// final or not, starts the recognition again whenever the browser ends it
// early, and finishes only after a long enough silence or a tap on stop.

const MAXIMUM_ALTERNATIVES = 3;
const DEFAULT_SILENCE_AFTER_SPEECH_MILLISECONDS = 5000;
const DEFAULT_NO_SPEECH_LIMIT_MILLISECONDS = 10000;
// A browser that ends the recognition instantly every time must not be
// restarted forever.
const MAXIMUM_RESTARTS = 20;

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
  'language-not-supported': 'English (India) speech is not supported on this phone. Type entries instead.',
};

// The pieces of speech in one browser result list: each piece is a list of
// alternative hearings, most likely first.
function piecesFrom(results) {
  return Array.from(results, (piece) =>
    Array.from(piece, (alternative) => alternative.transcript.trim()).filter(Boolean),
  ).filter((piece) => piece.length > 0);
}

// One piece keeps all its alternatives. Several pieces of one utterance are
// joined using the best hearing of each.
function hearingsFrom(pieces) {
  if (pieces.length === 0) return [];
  if (pieces.length === 1) return [...new Set(pieces[0])];
  return [pieces.map((piece) => piece[0]).join(' ')];
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

  // Pieces heard before the browser last ended the recognition, and pieces
  // heard since it was started again.
  let piecesFromEarlierStarts = [];
  let piecesFromCurrentStart = [];
  let errorMessage = '';
  let stopRequested = false;
  let restartCount = 0;
  let silenceTimer = null;

  function allHearings() {
    return hearingsFrom([...piecesFromEarlierStarts, ...piecesFromCurrentStart]);
  }

  function requestStop() {
    stopRequested = true;
    recognition.stop();
  }

  function stopAfter(milliseconds) {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(requestStop, milliseconds);
  }

  // True if the recognition was started again after the browser ended it.
  function startAgain() {
    if (restartCount >= MAXIMUM_RESTARTS) return false;
    restartCount += 1;
    piecesFromEarlierStarts = [...piecesFromEarlierStarts, ...piecesFromCurrentStart];
    piecesFromCurrentStart = [];
    try {
      recognition.start();
      return true;
    } catch {
      return false;
    }
  }

  const finished = new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      const pieces = piecesFrom(event.results);
      if (pieces.length === 0) return;
      piecesFromCurrentStart = pieces;
      onInterimText?.(allHearings()[0]);
      stopAfter(silenceAfterSpeechMilliseconds);
    };
    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are not failures: whatever was heard stands.
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      errorMessage = ERROR_MESSAGES[event.error] ?? `Speech recognition failed (${event.error}).`;
    };
    recognition.onend = () => {
      // The browser ended it early, during a pause: keep listening.
      if (!stopRequested && !errorMessage && startAgain()) return;
      clearTimeout(silenceTimer);
      const hearings = allHearings();
      if (errorMessage && hearings.length === 0) reject(new Error(errorMessage));
      else resolve(hearings);
    };
  });

  recognition.start();
  stopAfter(noSpeechLimitMilliseconds);
  return { finished, stop: requestStop };
}
