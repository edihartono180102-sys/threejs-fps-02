// The match: 5 v 5, first to 5 rounds, at most 9. Each round is a 12 s buy
// phase, then 100 s live. Money is the player's only: kills pay $300, a round
// win $3,250, a loss $1,900 plus $500 a consecutive loss, planting $300. The
// bots always field their assigned weapon, so the economy is yours to play.
// Win reasons: elimination, detonation, defuse, timeout (defenders win).
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createRounds() {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'over' | 'match'
    phaseLeft: BUY_SECONDS,
    round: 1,
    score: { vanguard: 0, ember: 0 },
    money: 800,
    lossStreak: 0,
    winner: null,
    reason: '',
    matchWinner: null,
  };

  function beginRound() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.winner = null;
    state.reason = '';
  }

  return {
    state,
    beginMatch() {
      state.score.vanguard = 0;
      state.score.ember = 0;
      state.money = 800;
      state.lossStreak = 0;
      state.round = 1;
      state.matchWinner = null;
      beginRound();
    },
    beginRound,
    // Count the phase clock down. Returns 'live' when the buy phase ends,
    // 'timeout' when the live clock runs out, else ''.
    tick(dt) {
      if (state.phase === 'buy' || state.phase === 'live') {
        state.phaseLeft -= dt;
        if (state.phaseLeft <= 0) {
          if (state.phase === 'buy') {
            state.phase = 'live';
            state.phaseLeft = ROUND_SECONDS;
            return 'live';
          }
          return 'timeout';
        }
      } else if (state.phase === 'over') {
        state.phaseLeft -= dt;
        if (state.phaseLeft <= 0) {
          if (state.matchWinner) {
            state.phase = 'match';
          } else {
            state.round += 1;
            beginRound();
            return 'next';
          }
        }
      }
      return '';
    },
    // Close a round: pay out, count the score, decide the match.
    winRound(team, reason) {
      if (state.phase === 'over' || state.phase === 'match') return false;
      state.winner = team;
      state.reason = reason;
      state.score[team] += 1;
      if (team === 'vanguard') {
        state.money += 3250;
        state.lossStreak = 0;
      } else {
        state.money += 1900 + Math.min(2, state.lossStreak) * 500;
        state.lossStreak += 1;
      }
      state.phase = 'over';
      state.phaseLeft = 4;
      if (state.score[team] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
        state.matchWinner = state.score.vanguard > state.score.ember ? 'vanguard' : state.score.ember > state.score.vanguard ? 'ember' : 'draw';
      }
      return true;
    },
    addMoney(amount) {
      state.money += amount;
    },
    canBuy() {
      return state.phase === 'buy';
    },
  };
}
