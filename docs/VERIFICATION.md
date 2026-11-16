# Verification status

Live verification of every tool, run against a real signed-in session.

- **Last checked:** 16 November 2026, 14:42-15:44 WITA (UTC+8)
- **Tested on:** Google Chrome, Linux
- **Test account:** a second account

## Round 2 sweep (16 November 2026, later)

A second full sweep of all 34 tools (dry run) reported 26 working, 4 partial
and 4 broken. Live DOM diagnosis found the root causes, all of them Instagram
layout changes, and each fix is covered by local fixture tests
(`test/dom.test.mjs`, 10 cases) plus the protocol suite:

- `followers_list` / `following_list`: the profile stats are links with
  `href="#"`; the dialog opens by script. The tools now click the stat by its
  text, recognize the dialog by its heading, and scroll it.
- `dm_send_to_user`: the profile Message button opens a floating chat panel
  on the profile page instead of navigating to a thread URL. Both flows are
  now handled.
- `search`: the search input can be covered by its own pill button, which
  failed the click actionability check. The click is now layered and typing
  goes through the page keyboard.
- `post_comments`: comments are stacked blocks in the right column, not list
  items. Rows are now extracted from their Reply element, and the column is
  scrolled to load more.
- `comment_like`: the like button is now tagged on the smallest matching
  comment row instead of being searched inside a hovered list item.

The 3 story tools remain blocked by Instagram Web itself, as recorded above.

## Live results

| Tool | Result |
| --- | --- |
| `ig_status` | Pass |
| `ig_selftest` | Pass (gate and protocol tests local; the live rounds below follow the same full flow) |
| `dm_list_threads` | Pass |
| `dm_check` | Pass |
| `dm_read_thread` | Pass |
| `dm_send` | Pass, including delivery and seen status |
| `dm_send_to_user` | Pass |
| `profile_get` | Pass |
| `search` | Pass |
| `post_create` | Pass |
| `user_posts` | Pass |
| `post_get` | Pass |
| `post_comments` | Pass |
| `post_like` | Pass |
| `post_comment` | Pass |
| `post_reply_to_comment` | Pass |
| `comment_like` | Pass |
| `post_save` | Pass |
| `post_delete` | Pass (the test post was deleted as the run's cleanup) |
| `media_urls` | Pass |
| `feed_home` | Pass |
| `explore_posts` | Pass |
| `hashtag_posts` | Pass |
| `user_follow` | Pass |
| `user_unfollow` | Pass |
| `followers_list` | Pass |
| `following_list` | Pass |
| `notifications_list` | Pass |
| `stories_tray` | Pass |
| `story_view` | Pass |
| `story_reply` | Pass, delivered to the DM thread as a story reply |
| `story_create` | Blocked by platform |
| `story_create_poll` | Blocked by platform |
| `story_delete` | Blocked by platform |

**Summary:** 31 of 34 tools pass live. The 3 blocked tools share one cause, described below.

## DM watcher (v0.3.0, 16 November 2026)

Two tools were added after the sweep above: `dm_watch` and `dm_events`. Their verification status:

| Tool | Result |
| --- | --- |
| `dm_watch` | Pass (protocol and live browser state) |
| `dm_events` | Pass (protocol and live browser state) |

What was verified, and at which level:

- Unit level: `test/watcher.test.mjs` injects fake snapshot and verify functions and proves the watcher rules: the baseline never reports old messages, a verified new message produces exactly one event, repeated polls do not duplicate it, the spam flag is set on link-only and promo messages, the cursor in `dm_events` advances correctly, and the signed-out state is reported once.
- Protocol level: the MCP suite covers tool discovery for all 36 tools, the `logging` capability announced at initialize, and `dm_watch` status plus `dm_events` calls without a browser.
- Live browser level: a real MCP client started the watcher against a Chrome window showing the real Instagram login page (the VM browser was signed out). The watcher reported state `signed_out`, pushed one `notifications/message` notification (logger `dm-watch`) to the client, and `dm_events` returned the same event.
- Full loop, simulated arrival: with the page layer injected, a new DM produced the `dm_new_message` event, the exact notification envelope the server sends, and the `dm_events` pull.

Not yet verified live: a real DM arriving into a signed-in browser watched by this server. That last step needs a Chrome window signed in to the second account with remote debugging on, then one incoming message while `dm_watch` is running.

## Platform limitation: story creation on the web

Instagram Web offered no story creation entry point for the test account: no "Your story" button in the stories tray, the Create menu only starts a post, and the profile avatar only changes the profile photo. Because no story could be created on the web, `story_create` and `story_create_poll` could not be exercised, and `story_delete` had no web-created story to delete.

The tools detect this and report it clearly instead of failing silently. Story creation should be treated as not available on Instagram Web for accounts whose web UI lacks the composer; for those accounts it remains a mobile app feature.

## Notes from the run

- Replies sent with `post_reply_to_comment` display with an @mention prefix, which Instagram adds automatically.
- The hashtag page URL redirects to the keyword search page; the post grid still loads and `hashtag_posts` collects it normally.
- On a private account, a re-follow ends in the `Requested` state until the owner approves it. `user_follow` reports that state as it is. In this run the owner approved the request and the end state matched the starting state (`Following`).
- A second round on the same day re-verified `search`, `user_posts`, `profile_get`, and `post_get` after fixes prompted by real agent use: search now goes through the nav search panel and returns account rows with avatars, profile grids return their full post list (12 unique posts sampled), profile stats read from the header, and a post's author is read from the article header, so a tagged account that appears earlier in the article is no longer mistaken for the author.
- The local protocol test suite (`npm test`) passes in full: handshake, tool discovery for all 36 tools, annotations, server instructions, ping, unknown methods, graceful error without a browser, the self-test gate that refuses the full level without its safety settings, the DOM extractors against fixtures, and the DM watcher rules.
