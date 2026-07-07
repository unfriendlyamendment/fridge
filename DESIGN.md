# Fridge: a design study

*How a couple's breakup with Google Keep became a paper card on a screen.*

## The brief

We wanted what Google Keep gave us — a shared list both of us could reach from any device, where you can see who checked what — without giving our household's inner life to Google. The requirements wrote themselves: self-hosted, data in files we own and can read, light enough that using it feels like jotting, and legible at a glance about *who* did *what*.

But "Keep, self-hosted" wasn't the actual goal. Keep is a pile of notes; piles grow. The deeper brief was an old one: keep today's tasks in front of you, and everything else out of sight.

## The analogue heart

The interaction model is borrowed from [Analog by Ugmonk](https://ugmonk.com/pages/analog), a physical system of 3×5 task cards sitting in a wooden holder on your desk. Analog's insight is that constraint is the feature: a Today card has ten lines, you rewrite it each morning, and everything that isn't for today goes to a Next or Someday card so it stops shouting at you.

Fridge translates that ritual rather than the object:

- **A fresh dated card every day.** Unfinished items carry over automatically, marked with ›› like a bullet-journal migration. The app counts how many days an item has carried — a quiet honesty metric. Past cards remain browsable, like flipping through the used stack.
- **Now / Soon / Later.** We renamed Analog's Today/Next/Someday to be time-shaped rather than calendar-shaped (and the names are user-editable, because rituals are personal).
- **Ten ruled lines.** The card renders its empty lines like the printed card, and at ten open items a gentle nudge appears — *keeping tasks focused helps you finish them* — but never blocks. Paper doesn't stop you from writing in the margins either. The Later card is exempt: aspiration lists are allowed to be long.
- **The slashed circles, the ○○○ corner dots, the tinted stock** (white Now, cream Soon, blue Later) are lifted from close study of the physical cards — the pixel homage that makes it feel like an object instead of an app.

## Two inks

The defining feature of a shared list is *who*. Keep shows an avatar; we wanted something more domestic. Each person picks an ink color, and everything they write appears in it — as if the household kept one notepad and two pens. When your partner checks off something you wrote, the circle fills in *their* ink and the strikethrough is theirs, crossing your words. The metadata is the typography.

The name Quartet was considered when we flirted with four inks. We settled on two-by-default (a second person is optional, addable later) and the name **Fridge** — because "put it on the fridge" is a ritual every household already understands.

## Color: Sanzo Wada

The palette comes from Sanzo Wada's 1930s *Dictionary of Color Combinations*, via the swatch site [wada-sanzo-colors.com](https://www.wada-sanzo-colors.com):

| Use | Color | Hex |
|---|---|---|
| Later card / accents | Pale King's Blue | `#a7d4e4` |
| Dark theme foundation | Dusk blue | `#40456a` |
| Soon card | Sulphur Yellow | `#f5ecc2` |
| Active elements | King's Blue | `#006eb8` |
| Selection highlight | Pink | `#f37f94` |

Light mode is ink on paper; dark mode rebuilds the same cards on dusk blue rather than dimming them. Default inks are King's Blue and a Sanzo brick red — every color a user can see is either Wada's or their own choice.

## Type and surface

The typeface is Avenir (system-native on Apple devices, with Futura/Century Gothic fallbacks), borrowed from the unhurried plainness of the Wada swatch site: 18px body, sentence-case headings, no bold anywhere in running text. Buttons are thin-outlined pills; rules are hairlines; the card floats on a soft shadow with rounded corners. The goal was for the interface to have the temperature of stationery, not software.

## Structural decisions

**A passphrase is a workspace.** No accounts, no usernames, no email. Typing "tangerine bicycle whisper june" from any device opens that workspace — the secret-clubhouse-door model. We accepted the tradeoff this implies (your security is your phrase's strength) because the alternative was rebuilding the account systems we were escaping.

**Plain JSON on disk.** No database. Every workspace is a folder of human-readable files with atomic writes, a forever-archive (clearing a task moves it, nothing deletes it), and automatic daily snapshots. The exit door is always open: one-click CSV export, one-click full JSON backup. Software you can leave is software you can trust.

**Two files of code.** A zero-dependency Node server and a single HTML file. One state object, one render function, server-sent events for live sync. This is an aesthetic position as much as a technical one: an app a couple can own should be an app one person can read.

**Small kindnesses.** A clock in the viewer's own timezone next to the date. A held-back re-render so your partner's checkmark can't wipe the sentence you're mid-typing. A midnight watcher so a popup left open overnight greets you with the new day's card. Done items sink but stay visible, because a list that hides finished work hides the day's satisfaction.

## Screenshots

![Light mode](docs/screenshot-light.png)
![Dark mode](docs/screenshot-dark.png)
![The guide](docs/screenshot-guide.png)

---

*Fridge is MIT-licensed and self-hostable. Designed by [Hazel / Brownish Studio](https://brownish.studio).*
