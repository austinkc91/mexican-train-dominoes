class Scorer {
  static scoreRound(players) {
    const scores = {};
    for (const player of players) {
      scores[player.id] = player.hand.length === 0 ? 0 : player.getHandPipCount();
    }
    return scores;
  }

  static updateTotalScores(players, roundScores) {
    for (const player of players) {
      player.totalScore += (roundScores[player.id] || 0);
    }
  }

  static getFinalStandings(players) {
    return [...players]
      .sort((a, b) => a.totalScore - b.totalScore)
      .map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        color: p.color,
        totalScore: p.totalScore
      }));
  }

  static getWinner(players) {
    return players.reduce((best, p) =>
      p.totalScore < best.totalScore ? p : best
    , players[0]);
  }
}

module.exports = Scorer;
