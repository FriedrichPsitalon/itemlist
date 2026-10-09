---
title: Guide
layout: page
permalink: /guide/
hide_title: true
description: "How to play along with RimStream: earning coins, what chat can buy, and how to build a pawn."
thumbnail: compendium/social-preview.png
---

{%- comment -%}
  Every number on this page comes from the data, so it can't drift:
  earn rate, starting balance and minimum spend from _data/economy.yml,
  prices from the synced _data/StoreIncidents.json. Don't type a coin amount into the text below.
{%- endcomment -%}
{%- assign eco = site.data.economy -%}
{%- assign inc = site.data.StoreIncidents.incitems -%}
{%- assign p_pawn = inc | where: "abr", "pawn" | first -%}
{%- assign p_wildman = inc | where: "abr", "wildman" | first -%}
{%- assign p_prisoner = inc | where: "abr", "prisoner" | first -%}
{%- assign p_maninblack = inc | where: "abr", "maninblack" | first -%}

<link rel="stylesheet" href="/itemlist/assets/css/guide-theme.css">

<a id="top"></a>

<details markdown="1">
<summary>New to RimWorld entirely? Start here →</summary>

**RimWorld** is a sci-fi colony survival game. A handful of survivors crash-land on a hostile planet and try to stay alive — building a base, growing food, fighting off raiders, and mostly failing in increasingly dramatic ways. That's the whole game, and it's why it's fun to watch.

A few words you'll hear constantly on stream:

- **Pawn** — a colonist. Not a "character," not a "unit" — a pawn. Each one has skills, moods, and strong opinions about basically everything that happens to them.
- **Raid** — a group of hostiles showing up to ruin the colony's day. Extremely common. Somehow still always a surprise.
- **Mood / mental break** — pawns have feelings, and when those feelings tank hard enough, they do something regrettable. Chat can make this worse. Chat frequently does.

That's genuinely all you need to follow along. Everything else — traits, biomes, the seventeen different ways a colony can catch fire — you'll pick up just by watching.

One more thing, and this one matters for everybody, not just newcomers: just by hanging out in chat, you're earning coins — coins you can spend to influence the colony, directly or indirectly, pleasantly or apocalyptically. Here's how that works.

</details>

## Getting Involved

Coins are earned by being in chat: **{{ eco.earn_per_minute }} coins a minute**, and you start with **{{ eco.starting_balance }}**. Lurk and your coins/minute starts to drop — bottoms out after an hour. Subscribers get {{ eco.sub_bonus_percent }}% more.

Coins can be spent to [help](/itemlist/compendium/?tag=Help), to [harm](/itemlist/compendium/?tag=Chaos), or to [involve yourself directly](#build-a-pawn). Helping and harming impact your karma, which also impacts your coin flow. If you're truly violent and evil, the game will slow you down some — but you can still be evil, fear not.

For exact commands — and there are a lot of them — check the [Commands page](/itemlist/commands).

## Spending Coins

<a id="how-to-buy"></a>

**How to buy anything, start to finish:**

1. Find it in the [Store](/itemlist/compendium/).
2. Click **Copy** on its row.
3. Paste it into Twitch chat and send it. `!bal` shows what you've got left.

A few things need extra words after the command — a skill, a trait, a quantity. The Store shows you an example when they do, and the [Commands page](/itemlist/commands) covers the rest.

There's a minimum: a purchase has to come to at least {{ eco.min_spend }} coins. The very cheap stuff is sold by the bunch, so it's `!buy hay {{ eco.min_spend }}`, not `!buy hay`. Ask for too little and the bot tells you to try again with a larger quantity. Just ask again with a bigger number.

<a id="build-a-pawn"></a>

**Get directly involved:** you can get a pawn with your name in the game, and then gear them, boost them, trait them, implant them — all the things. [Browse the Store](/itemlist/compendium/) — there's a lot of routes. How to develop them depends on your job intent — see below.

- `!buy pawn` — {% include coins.html n=p_pawn.price %} gets you a default colonist in default gear with your name on it. Totally random.
- `!buy wildman` ({% include coins.html n=p_wildman.price %}) or `!buy prisoner` ({% include coins.html n=p_prisoner.price %}) — a specific background. Have to actually be recruited by the colony.
- `!buy maninblack` — {% include coins.html n=p_maninblack.price %}, but you get a mysterious gunslinger with a duster, flak vest, cowboy hat, and a revolver. You're aimin' to clean up this here settlement.
- `!joinqueue` — free. Puts you in line to adopt a colonist who already exists and is unclaimed, rather than one built from scratch. Less control over who you get, but they come with some history already on them.

**Chaos Reigns!** — [bad events galore!](/itemlist/compendium/?tag=Chaos) When you want to make someone's day worse, all the options are here.

**Make Things Interesting** — maybe you just want to see something happen? [Neutral events here.](/itemlist/compendium/?tag=Mix)

## Picking your pawn's job

Once you've got a pawn, "build a pawn" isn't one path — it's a stack of decisions: job, class, attributes, implants, gear, enchantments. Full breakdown of that stack, plus every job and class, lives here:

- **[Jobs](/itemlist/guide/jobs/)** — start here if you know what you want a pawn to *do* (mining, healing, tanking, crowd control, and so on) and want to see which class or classes cover it.
- **[Classes](/itemlist/guide/classes/)** — start here if you want the full rundown of a specific class's bonuses, penalties, and spells.
