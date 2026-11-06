# Firebase setup (Nir, about 5 minutes, free)

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. **Create a project** → name it `relu70-trivia` → turn **off** Google Analytics → Create.
3. In the left menu: **Build → Realtime Database → Create Database**.
   - Location: **europe-west1 (Belgium)**, the closest to Israel.
   - Security rules: choose **Start in locked mode** (I'll give you the real rules below).
4. On the **Rules** tab, replace everything with the rules below and click **Publish**:

```json
{
  "rules": {
    "current": { ".read": true, ".write": true },
    "games": {
      "$game": {
        ".read": true,
        "state":   { ".write": true },
        "players": { "$pid": { ".write": true } },
        "answers": { "$q": { "$pid": { ".write": "!data.exists()" } } }
      }
    }
  }
}
```
   (Anyone with the link can read and join the game room. A phone can answer each question only once.)

5. Go to the gear icon ⚙ → **Project settings** → **General** → scroll to "Your apps" → click the **</>** (Web) icon.
   - App nickname: `trivia` → **Register app** (do NOT tick Firebase Hosting).
   - Firebase shows a `firebaseConfig = { apiKey: ..., authDomain: ..., databaseURL: ..., projectId: ..., ... }` block.
6. Copy that whole block and paste it to me in the chat.

These config values aren't secret: every website that uses Firebase puts them in its page code. Nothing here costs money. The free Spark plan allows 100 phones at once and 10 GB of downloads a month, and our game uses only a tiny amount of data (videos are served from GitHub Pages, not Firebase).
