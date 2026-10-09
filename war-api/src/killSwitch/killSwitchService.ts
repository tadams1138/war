import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { logAction } from '../moderation/moderationLogRepository.js';
import { setKillSwitch } from './killSwitchRepository.js';

/**
 * Turns the War-creation kill switch on or off (§6.7). Caller permission
 * (Moderator or Admin) is enforced by `requireModeratorOrAdmin`, not here. The
 * state change and its moderation log entry commit together or not at all.
 */
export async function changeKillSwitch(db: Kysely<Database>, callerVoterId: string, enabled: boolean): Promise<boolean> {
  await db.transaction().execute(async (trx) => {
    await setKillSwitch(trx, enabled);
    await logAction(trx, {
      action: `${enabled ? 'enable' : 'disable'}_war_creation_kill_switch`,
      staffVoterId: callerVoterId,
    });
  });
  return enabled;
}
