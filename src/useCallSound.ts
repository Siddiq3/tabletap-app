import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

/** A bundled sound effect; no microphone, remote media, or background audio needed. */
export function useCallSound() {
  const player = useAudioPlayer(require('../assets/staff-call.wav'));
  const [enabled, setEnabled] = useState(Platform.OS !== 'web');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {
      setEnabled(false); setError('Sound is unavailable. Vibration and visual alerts remain on.');
    });
  }, []);
  const play = useCallback(async () => {
    if (!player.isLoaded) return;
    try { await player.seekTo(0); player.volume = .8; player.play(); }
    catch { setError('Could not play sound. Check your volume or try enabling sound again.'); }
  }, [player]);
  const notify = useCallback(() => { if (enabled) void play(); }, [enabled, play]);
  async function toggle() {
    if (enabled) { player.pause(); setEnabled(false); setError(null); return; }
    if (!player.isLoaded) { setError('Alert sound is loading. Please try again in a moment.'); return; }
    setError(null); setEnabled(true); await play();
  }
  return { enabled, error, notify, toggle };
}
