# Running "How well do you know Relu?" at the party

**TV:** https://nir-ai-development.github.io/relu70-trivia/  (the laptop connected to the TV)
**Phones:** guests scan the QR code on the TV (or open …/relu70-trivia/play.html)

## Before guests arrive (10 min)
1. Connect the laptop to the TV by HDMI. Turn off sleep and the screen saver, and plug in the charger.
2. Open the TV link in Chrome and press **F** for full screen. Turn the sound up (the game plays short chimes and ticks).
3. Want a clean start? Move the mouse → **משחק חדש** (new game). This clears every player and score.
4. Check with your own phone: scan the QR code and make sure your name appears on the TV.
5. Keep the TV tab in front. If the tab is in the background, the timer slows down.

## Running the game
| Key | Button | What it does |
|-----|--------|--------------|
| Space / Enter / ← | הבא ⏭ | Next step: lobby → question → answer reveal → leaderboard → next question … → podium → birthday ending |
| P | השהיה ⏸ | Pause or resume. During a question, the clock stops on the TV and on every phone. |
| S | דלג על שאלה | Skip this question without scoring |
| F | ⛶ | Full screen |
| M | 🔊 | Sound on or off |

- A question closes by itself when time runs out, or as soon as everyone has answered. The reveal then plays the video.
- From the reveal, press Space to show the leaderboard, then Space again for the next question.
- The last question (Guy's bar mitzvah) is the **golden question**, worth double points.
- After question 15, press Space for the podium (3rd, 2nd, then 1st, with confetti). Press Space once more for the "70 · Happy Birthday Relu" ending, with photos.
- To remove a player with a bad name, click their name in the lobby.

## If something goes wrong
- **A phone froze or was refreshed:** just reopen the link. The phone returns as the same player with the same score.
- **The TV page was closed or refreshed:** open the TV link again. The game continues from the same question. Don't press "new game".
- **A guest arrived late:** they can scan the QR and join in the middle of the game.
- **No internet at the venue:** the phones work fine over cellular data. The TV laptop needs internet (a phone hotspot is fine).

## Scoring
A correct answer earns 500 to 1,000 points depending on speed, and 3 correct answers in a row add a +100 bonus 🔥. A wrong answer earns 0.

## Changing a question
Edit `js/questions.js` (question text, answers, `a` = index of the correct answer, and a "fact" line shown on the reveal), then push.
