# Verification status

Live verification of every tool, run against a real signed-in session.

- **Last checked:** 16 November 2026, 14:42-15:08 WITA (UTC+8)
- **Tested on:** Google Chrome, Linux
- **Test account:** a second account

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

## Platform limitation: story creation on the web

Instagram Web offered no story creation entry point for the test account: no "Your story" button in the stories tray, the Create menu only starts a post, and the profile avatar only changes the profile photo. Because no story could be created on the web, `story_create` and `story_create_poll` could not be exercised, and `story_delete` had no web-created story to delete.

The tools detect this and report it clearly instead of failing silently. Story creation should be treated as not available on Instagram Web for accounts whose web UI lacks the composer; for those accounts it remains a mobile app feature.

## Notes from the run

- Replies sent with `post_reply_to_comment` display with an @mention prefix, which Instagram adds automatically.
- The hashtag page URL redirects to the keyword search page; the post grid still loads and `hashtag_posts` collects it normally.
- On a private account, a re-follow ends in the `Requested` state until the owner approves it. `user_follow` reports that state as it is. In this run the owner approved the request and the end state matched the starting state (`Following`).
- The local protocol test suite (`npm test`) passes in full: handshake, tool discovery for all 34 tools, annotations, server instructions, ping, unknown methods, graceful error without a browser, and the self-test gate that refuses the full level without its safety settings.
