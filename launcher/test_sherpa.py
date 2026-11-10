import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from launcher.sherpa import Api


class StopPolling(Exception):
    pass


class RaidHistoryTests(unittest.TestCase):
    def test_restored_raids_keep_death_markers_from_their_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            for index, session_name in enumerate(("log_2026.11.11_01-00-00", "log_2026.11.11_02-00-00"), 1):
                session = base / session_name
                session.mkdir()
                hour = index
                (session / "2026.11.11 application_01-00-00.log").write_text(
                    "".join(
                        f"2026-11-11 {hour:02}:{minute:02}:00.000 TRACE-NetworkGameCreate profileStatus Location: Woods, "
                        f"Sid: session-{index}, GameMode: deathmatch, shortId: RAID{index}{raid}\n"
                        f"2026-11-11 {hour:02}:{minute + 1:02}:00.000 GameRunned\n"
                        f"2026-11-11 {hour:02}:{minute + 10:02}:00.000 PrepareSelectedProfileLocally\n"
                        for raid, minute in enumerate((0, 20), 1)
                    ),
                    encoding="utf-8",
                )
                (session / "2026.11.11 output_01-00-00.log").write_text(
                    "".join(
                        f"2026-11-11 {hour:02}:{minute:02}:05.000 Player died\nDeathScreen_Shown\n"
                        for minute in (10, 30)
                    ),
                    encoding="utf-8",
                )

            api = Api()
            api._cfg = {"tarkov_logs": str(base)}
            api._raid_publish = lambda stage, raid: None
            with patch("launcher.sherpa.publish_game"), patch(
                "launcher.sherpa.threading.Event"
            ) as event:
                event.return_value.wait.side_effect = StopPolling
                with self.assertRaises(StopPolling):
                    api._poll_game_logs()

            if api._raid_closing:
                api._raid_closing = (api._raid_closing[0], api._raid_closing[1], 0)
                api._raid_maybe_finalize()

            self.assertEqual([raid["outcome"] for raid in api._raids], ["died"] * 4)


if __name__ == "__main__":
    unittest.main()
