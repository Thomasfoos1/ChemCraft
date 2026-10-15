import { useState } from 'react';
import { useGame } from '../game/store';
import { ACHIEVEMENTS, ZONES } from '../content';
import { accuracy, levelFromXp, reviewRecommendations } from '../game/scoring';
import { RECIPE_BY_ID } from '../chem/recipes';
import { prettyFormula } from '../chem/formula';
import { iconUrl, ACHIEVEMENT_ICON } from './icons';
import { SaveData } from '../game/save';

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A self-contained HTML report the student can download (nothing is uploaded anywhere). */
export function buildReport(save: SaveData): string {
  const zones = ZONES.filter((z) => save.zones[z.id]?.completed).map((z) => z.name);
  const compounds = save.recipesDiscovered.map((id) => `${RECIPE_BY_ID[id]?.name} (${prettyFormula(RECIPE_BY_ID[id]?.formula ?? '')})`);
  const ach = ACHIEVEMENTS.filter((a) => save.achievements.includes(a.id)).map((a) => a.name);
  const rec = reviewRecommendations(save);
  const rows = save.questionLog
    .map((q) => `<tr><td>${escapeHtml(q.id)}</td><td>${escapeHtml(q.topic)}</td><td>${q.correct ? 'Yes' : 'Guided'}</td><td>${q.attempts}</td><td>${q.hints}</td></tr>`)
    .join('');
  const name = save.nickname ? escapeHtml(save.nickname) : 'Apprentice Scientist';
  return `<!doctype html><html><head><meta charset="utf-8"><title>ChemCraft Results</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;color:#222}h1{color:#2a5a2a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}</style></head><body>
<h1>ChemCraft: The Elemental Dungeon — Results</h1>
<p><b>Scientist:</b> ${name}<br><b>Date:</b> ${new Date().toLocaleDateString()}<br><b>Status:</b> ${save.completed ? 'Dungeon complete' : 'In progress'}</p>
<p><b>Zones completed:</b> ${zones.length}/5 — ${escapeHtml(zones.join(', ') || 'none')}</p>
<p><b>Substances discovered:</b> ${escapeHtml(compounds.join(', ') || 'none')}</p>
<p><b>Questions answered:</b> ${save.stats.questionsAttempted} · <b>Correct:</b> ${accuracy(save)}% · <b>First-try correct:</b> ${save.stats.firstTryCorrect} · <b>Hints used:</b> ${save.stats.hintsUsed}</p>
<p><b>Time played:</b> ${fmtTime(save.stats.playTimeSec)} · <b>Level:</b> ${levelFromXp(save.xp).level} (${save.xp} XP)</p>
<p><b>Achievements:</b> ${escapeHtml(ach.join(', ') || 'none')}</p>
<h2>Recommended review</h2><ul>${rec.length ? rec.map((r) => `<li>${escapeHtml(r)}</li>`).join('') : '<li>Great work — no weak areas detected!</li>'}</ul>
<h2>Question log</h2><table><tr><th>Question</th><th>Topic</th><th>Correct</th><th>Attempts</th><th>Hints</th></tr>${rows}</table>
</body></html>`;
}

export function ResultsScreen() {
  const save = useGame((s) => s.save);
  const newGame = useGame((s) => s.newGame);
  const quit = useGame((s) => s.quitToMenu);
  const [nick, setNick] = useState(save?.nickname ?? '');
  if (!save) return null;
  const rec = reviewRecommendations(save);
  const zonesDone = ZONES.filter((z) => save.zones[z.id]?.completed).length;
  const lv = levelFromXp(save.xp);
  const download = () => {
    const blob = new Blob([buildReport({ ...save, nickname: nick })], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chemcraft-results.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const saveNick = (v: string) => {
    setNick(v);
    const s = useGame.getState().save;
    if (s) {
      s.nickname = v.slice(0, 24);
      useGame.getState().persist();
    }
  };
  return (
    <>
      <div className="overlay-dim">
        <div className="mc-panel results">
          <h2>{save.completed ? '★ MASTER OF MATTER ★' : 'Progress Report'}</h2>
          <div style={{ textAlign: 'center', color: '#3a3a3a' }}>
            {save.completed ? 'You escaped the Elemental Dungeon using the power of chemistry!' : 'Keep going — the dungeon awaits!'}
          </div>
          <div className="stat-grid">
            <div className="stat"><div className="sv">{zonesDone}/5</div><div className="sl">Zones completed</div></div>
            <div className="stat"><div className="sv">{save.recipesDiscovered.length}</div><div className="sl">Substances discovered</div></div>
            <div className="stat"><div className="sv">{save.stats.questionsAttempted}</div><div className="sl">Questions answered</div></div>
            <div className="stat"><div className="sv">{accuracy(save)}%</div><div className="sl">Correct answers</div></div>
            <div className="stat"><div className="sv">{save.stats.hintsUsed}</div><div className="sl">Hints used</div></div>
            <div className="stat"><div className="sv">{fmtTime(save.stats.playTimeSec)}</div><div className="sl">Time played</div></div>
            <div className="stat"><div className="sv">{lv.level}</div><div className="sl">Level ({save.xp} XP)</div></div>
            <div className="stat"><div className="sv">{save.achievements.length}/{ACHIEVEMENTS.length}</div><div className="sl">Achievements</div></div>
          </div>
          <h3>Discoveries</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {save.recipesDiscovered.map((id) => (
              <span key={id} className="ach" style={{ padding: '2px 8px' }}>
                <img src={iconUrl(id)} alt="" /> {RECIPE_BY_ID[id]?.name} ({prettyFormula(RECIPE_BY_ID[id]?.formula ?? '')})
              </span>
            ))}
          </div>
          <h3 style={{ marginTop: 10 }}>Achievements</h3>
          <div className="ach-grid">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.id} className={`ach ${save.achievements.includes(a.id) ? '' : 'locked'}`}>
                <img src={iconUrl(ACHIEVEMENT_ICON[a.icon] ?? 'star')} alt="" />
                <div>
                  <div className="an">{a.name}</div>
                  <div className="ad">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 10 }}>Recommended review</h3>
          <ul className="review-list">
            {rec.length ? rec.map((r) => <li key={r}>{r}</li>) : <li>Excellent! No weak areas detected. Try the bonus recipes in your Discoveries book.</li>}
          </ul>
          <div className="form-row">
            <label>Nickname for your certificate (optional, stays on this computer):</label>
            <input className="text-input" maxLength={24} value={nick} onChange={(e) => saveNick(e.target.value)} placeholder="e.g. Atom Ace" />
          </div>
          <div className="page-actions">
            <button className="mc-btn small" onClick={download}>Download Report</button>
            <button className="mc-btn small" onClick={() => window.print()}>Print Certificate</button>
            <button className="mc-btn small" onClick={newGame}>Play Again</button>
            <button className="mc-btn small green" onClick={quit}>Main Menu</button>
          </div>
        </div>
      </div>
      <div className="certificate">
        <div className="c-frame">
          <div className="c-small">ChemCraft: The Elemental Dungeon</div>
          <h1>Certificate of Achievement</h1>
          <div className="c-small">This certifies that</div>
          <div className="c-name">{nick || 'Apprentice Scientist'}</div>
          <div style={{ fontSize: 22, margin: '10px 0' }}>
            {save.completed ? 'has escaped the Elemental Dungeon and is officially a MASTER OF MATTER!' : `completed ${zonesDone} of 5 dungeon zones.`}
          </div>
          <div className="c-small">
            Substances discovered: {save.recipesDiscovered.map((id) => prettyFormula(RECIPE_BY_ID[id]?.formula ?? '')).join(', ')}
            <br />
            Questions answered: {save.stats.questionsAttempted} · Correct: {accuracy(save)}% · Achievements: {save.achievements.length}
          </div>
          <div className="c-small" style={{ marginTop: 40 }}>Signed, Dr. Matter — Head Scientist · {new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </>
  );
}
