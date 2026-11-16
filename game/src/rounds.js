// The match: 5 v 5, first to 5 rounds, at most 9. Each round is a 12 s buy
// phase, then 100 s live. Money is the player's only: kills pay $300, a
// round win $3,250, a loss $1,900 plus $500 a consecutive loss, planting
// $300. The bots always field their assigned weapon, so the economy is
// yours to play. Win reasons: elimination, detonation, defuse, timeout
// (defenders win). A loss streak deepens the payout up to three rounds,
// and a win streak pays a small bonus, so comebacks stay possible and
// blowouts stay expensive. Every round is recorded in history, so the
// end-of-match board can show how the match actually went.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
const WIN_PAY = 3250;
const LOSS_PAY = 1900;
const LOSS_STREAK_PAY = 500;
const LOSS_STREAK_CAP = 3;
const WIN_STREAK_PAY = 250;
const WIN_STREAK_CAP = 2;
const OVER_SECONDS = 4;

export function createRounds() {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'over' | 'match'
    phaseLeft: BUY_SECONDS,
    round: 1,
    score: { vanguard: 0, ember: 0 },
    money: 800,
    lossStreak: 0,
    winStreak: 0,
    history: [], // { round, winner, reason } per finished round
    winner: null,
    reason: '',
    matchWinner: null,
    matchPoint: false,
  };

  function beginRound() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.winner = null;
    state.reason = '';
  }

  function payout(winner) {
    if (winner === 'vanguard') {
      const bonus = WIN_STREAK_PAY * Math.min(WIN_STREAK_CAP, state.winStreak);
      state.money += WIN_PAY + bonus;
      state.winStreak += 1;
      state.lossStreak = 0;
    } else {
      const bonus = LOSS_STREAK_PAY * Math.min(LOSS_STREAK_CAP, state.lossStreak);
      state.money += LOSS_PAY + bonus;
      state.lossStreak += 1;
      state.winStreak = 0;
    }
  }

  function settleMatch(winner) {
    const decided = state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS;
    if (!decided) return;
    state.matchWinner = state.score.vanguard > state.score.ember
      ? 'vanguard'
      : state.score.ember > state.score.vanguard ? 'ember' : 'draw';
    state.matchPoint = false;
  }

  return {
    state,
    beginMatch() {
      state.score.vanguard = 0;
      state.score.ember = 0;
      state.money = 800;
      state.lossStreak = 0;
      state.winStreak = 0;
      state.history.length = 0;
      state.round = 1;
      state.matchWinner = null;
      state.matchPoint = false;
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
      state.history.push({ round: state.round, winner: team, reason });
      payout(team);
      state.phase = 'over';
      state.phaseLeft = OVER_SECONDS;
      const leader = state.score.vanguard > state.score.ember ? 'vanguard' : 'ember';
      const tied = state.score.vanguard === state.score.ember;
      state.matchPoint = !tied
        && state.score[leader] >= WIN_ROUNDS - 1
        && state.round < MAX_ROUNDS;
      settleMatch(team);
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
