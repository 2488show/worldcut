// The page's one sound engine (a restart of the game keeps it).
import { GameAudio } from './audio'

export const audio = new GameAudio()
if (typeof window !== 'undefined') (window as unknown as { __audio: GameAudio }).__audio = audio
