---
name: unofficial-instagram-mcp
description: Operate Instagram through the unofficial-instagram-mcp MCP server (tools prefixed ig_, dm_, post_, story_, user_). Use when the user asks to read or reply to Instagram DMs, check notifications, view profiles, followers or stories, search users or hashtags, browse feed or Explore, like, comment, reply to a comment, save, follow, unfollow, or create posts and stories on the signed-in account.
license: MIT
compatibility: Requires the unofficial-instagram-mcp server registered in the MCP client, Node.js 20+, and a Chrome window signed in to Instagram with remote debugging on port 9222.
metadata:
  project: unofficial-instagram-mcp
  server: instagram
---

# unofficial-instagram-mcp

An unofficial MCP server that controls Instagram Web through a Chrome window the
user is already signed in to. It does not use the Meta API and never handles the
user's password. All tools act on the visible web interface via Playwright over CDP.

## Setup, if the server is not connected yet

1. Clone https://github.com/fanyzp/unofficial-instagram-mcp and run `npm install`.
2. Copy `.env.example` to `.env`. Keep `IG_DRY_RUN=true`.
3. Chrome must run with `--remote-debugging-port=9222`. The user signs in to
   Instagram manually in that window. Never ask for or store the password.
4. Register `src/server.js` as a stdio MCP server named `instagram`, absolute path.
5. Call `ig_status` first and confirm the signed-in username with the user.

## Operating rules

- Always start a session with `ig_status`. If it errors, the browser is not
  reachable or not signed in; report that instead of retrying blindly.
- Trust tool results. They state `dryRun`, `sent`, `liked`, `alreadyLiked`,
  `following`, and similar fields honestly. Never claim an action happened when
  the result says otherwise.
- `IG_DRY_RUN=true` means write tools prepare and report, but do not complete,
  the final action. Do not disable dry run unless the user explicitly approves.
- Before any real write (send, comment, post, follow), show the user the exact
  target and content when the user has not already specified both.
- Never call the same write twice for the same content. If a result is unclear,
  read first (for example `post_comments` or `dm_read_thread`) to verify state.
- Side effects of reads: `dm_list_threads` and `dm_check` open threads and can
  mark them read. `story_view` marks the story as seen.
- Keep volume low and human-paced. Stop if Instagram shows a warning or checkpoint
  and tell the user.

## Tool map

System: `ig_status` (connection and account), `ig_selftest` (built-in verification).

DM: `dm_list_threads`, `dm_check` (threads waiting for a reply), `dm_read_thread`,
`dm_send` (existing thread), `dm_send_to_user` (by username).

Profile and search: `profile_get`, `search` (returns users, hashtags, and media
shown for the keyword).

Posts: `user_posts`, `post_get`, `post_comments`, `media_urls`, `post_create`,
`post_like`, `post_comment`, `post_reply_to_comment` (reply to one comment whose
text matches), `comment_like`, `post_save`, `post_delete` (own posts only).

Discovery: `feed_home`, `explore_posts`, `hashtag_posts`.

Social: `user_follow`, `user_unfollow`, `followers_list`, `following_list`,
`notifications_list`.

Stories: `stories_tray` (accounts with active stories), `story_view`,
`story_reply`, `story_create` (image file, or text when the web text editor is
available), `story_create_poll` (image plus poll sticker), `story_delete` (own
active story). Platform limit: Instagram Web exposes no story creation entry
point for many accounts, so `story_create` and `story_create_poll` may report
that creation is unavailable on web; do not promise the user a story in that
case.

## Workflows

- DM triage: `ig_status` then `dm_check`, then `dm_read_thread` for the thread,
  then `dm_send` with the reply.
- Join a post discussion: `post_comments` first, decide, then
  `post_reply_to_comment` with a `match` string from the comment you read.
- Research: `search` or `hashtag_posts`, then `post_get` and `post_comments`,
  then `media_urls` if the media itself is needed.
- Engagement check: `notifications_list`, then respond with `post_comments`,
  `post_reply_to_comment`, or `dm_check`.
- Publish: prepare the file and caption, run `post_create` in dry run first,
  show the user the prepared result, and only share for real after approval.

## Self-test

Recommend the user run the self-test once after setup, ideally on a second
account: `ig_selftest` with level `safe` only reads. Level `full` exercises every
write function on content it creates itself and deletes all of it at the end; it
refuses to run unless `IG_SELFTEST_FULL=true`, `IG_DRY_RUN=false`, and
`IG_SELFTEST_ACCOUNT` equals the signed-in username. Never run the full level on
the user's main account.

## Troubleshooting

- `ig_status` connection refused: Chrome is not running with port 9222, or
  `CDP_URL` in `.env` points somewhere else.
- Signed-in user is null: the Chrome window is not signed in to Instagram.
- A tool reports a button or selector was not found: the Instagram web interface
  changed. Labels live in `config/selectors.json`; report which tool failed
  instead of guessing a workaround.
- Story text or poll sticker unavailable: Instagram web exposes these per
  account. The tools return the reason; fall back to an image story.
