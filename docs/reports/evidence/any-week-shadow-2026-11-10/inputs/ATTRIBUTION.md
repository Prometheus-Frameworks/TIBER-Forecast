# Attribution and licence notice for the retained source snapshots

The eight `*.csv.gz` files in this folder are copies of data published by the **nflverse** project.

- **Creator / attribution:** the nflverse project, via its `nflverse-data` repository of automated data releases.
- **Provider repository:** <https://github.com/nflverse/nflverse-data>
- **Releases page:** <https://github.com/nflverse/nflverse-data/releases>
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) — <https://creativecommons.org/licenses/by/4.0/> (legal code: <https://creativecommons.org/licenses/by/4.0/legalcode>)
- **Provider's own licence file:** <https://github.com/nflverse/nflverse-data/blob/d691265da60e82f7ba22fd08baef823e51c582cc/LICENSE.md>

## Source assets

| Retained file | Source asset | Release tag | Retrieved (UTC) | SHA-256 of the source CSV bytes |
|---|---|---|---|---|
| `games.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv> | `schedules` | 2026-11-10T15:58:07Z | `1d90e60f71253f217ab698236616d367bf93cddfddac545c29b1fcb33cf87d65` |
| `legacy_player_stats_2024.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_2024.csv> | `player_stats` | 2026-11-10T15:57:29Z | `4f1598c9a6ba396a52e256762a0d9148abd22cdf856f26fc8825fa1d1dc49631` |
| `stats_player_week_2021.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2021.csv> | `stats_player` | 2026-11-10T15:57:25Z | `41915fb49238902ad1f129ebf0405b11a1e710454ae0fe8f7b3e4f9145875f48` |
| `stats_player_week_2022.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2022.csv> | `stats_player` | 2026-11-10T15:57:26Z | `ad426c3fe5bf1cc30c3f137fdfe96d054e19d400879ee4413129da49fa7b54be` |
| `stats_player_week_2023.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2023.csv> | `stats_player` | 2026-11-10T15:57:27Z | `f19cb71a5de0dce7fd09376026237c9ee9d5a93fe13815a2ea3ec2d37204cb17` |
| `stats_player_week_2024.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2024.csv> | `stats_player` | 2026-11-10T15:57:28Z | `3ddc45a84f759aa348ce465ae001752c530575455717657cdfe1f8abfcdb4759` |
| `stats_player_week_2025.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv> | `stats_player` | 2026-11-10T15:57:28Z | `e5e0615b3d96a3eaebfaee91e55afb4a4e7fe0caf057454177bcd7d6ad4bcfc2` |
| `stats_player_week_2026.csv.gz` | <https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv> | `stats_player` | 2026-11-10T15:57:29Z | `edac7bfc5969a8ec553d8b0e3d9e479e924b8492fd048139f83c6e9e306887e6` |

## Changes made

**None to the data.** Each source CSV was retained byte for byte and placed inside a gzip container (`gzip -n -9`). Decompressing a container yields the exact bytes retrieved; `RAW.sha256` lists their SHA-256 values and `GZ.sha256` lists the containers'. One file was renamed on retrieval so the two 2024 assets could sit side by side: `player_stats_2024.csv` is held as `legacy_player_stats_2024.csv`. No row, column or value was added, removed, reordered, rounded or edited.

## Provider notices

- The pinned provider licence record is in [`provider-licence/`](provider-licence/): `LICENSE.md` and `README.md` exactly as served from provider commit `d691265da60e82f7ba22fd08baef823e51c582cc` (the repository's default-branch head when read on 2026-11-10 at about 16:53 UTC), with their hashes in `provider-licence/SHA256SUMS`.
- At that commit the provider's `LICENSE.md` is the Creative Commons Attribution 4.0 International legal code. Neither it nor the `README.md` carries a separate copyright line, attribution wording, or notice file; none is reproduced here because none was found. Only those two files were read; release pages and package documentation were not searched for further notices.
- **Disclaimer of warranties (licence Section 5):** the material is offered as-is and as-available, without representations or warranties of any kind, and with the limitation of liability set out in that section. That disclaimer travels with these copies.
- The licence record documents the terms that were observed. It is not legal advice and it is not a determination that any particular use is permitted.

## What this notice does not do

It does not admit these files as a Forecast source or for any Forecast purpose. They are retained only as the evidence a shadow experiment actually read. Nothing here acquires or refreshes football inputs.
