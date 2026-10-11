package com.gensynth.core.cli;

import com.gensynth.core.model.SimulationSnapshot;
import com.gensynth.core.monitoring.ResourceUsage;
import org.jline.utils.AttributedString;
import org.junit.Test;

import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.*;

public class StatusPanelTest {

    private static final long NOW = 1_000_000L;
    private static final ResourceUsage USAGE = new ResourceUsage(12.34, 148, 512, 40);

    private static SimulationSnapshot simulation(int id, String file, SimulationSnapshot.Status status, long errors) {
        return new SimulationSnapshot(id, Paths.get("/data", file), "out", status, 1, 2, NOW - 252_000,
            status == SimulationSnapshot.Status.RUNNING ? 0 : NOW, 34_100, errors, List.of(), 820, 20, 2_150);
    }

    @Test
    public void withoutSimulationsOnlyTheSummaryIsShown() {
        List<AttributedString> lines = StatusPanel.lines(
            List.of(simulation(1, "old.gsynth", SimulationSnapshot.Status.STOPPED, 0)), USAGE, NOW, 120, 5);

        assertEquals(2, lines.size());
        assertTrue(lines.get(0).toString().startsWith("───"));
        String summary = lines.get(1).toString();
        assertTrue(summary, summary.contains("No simulations running"));
        assertTrue(summary, summary.contains("CPU 12.3%"));
        assertTrue(summary, summary.contains("RAM 148 MB"));
        assertTrue(summary, summary.contains("MSG/S 0"));
    }

    @Test
    public void eachRunningSimulationHasItsLineAndTheSummaryAddsThemUp() {
        List<AttributedString> lines = StatusPanel.lines(List.of(
            simulation(1, "plant.gsynth", SimulationSnapshot.Status.RUNNING, 0),
            simulation(2, "line 2.gsynth", SimulationSnapshot.Status.RUNNING, 2)), USAGE, NOW, 120, 5);

        assertEquals(4, lines.size());
        String summary = lines.get(1).toString();
        assertTrue(summary, summary.contains("2 running"));
        assertTrue(summary, summary.contains("MSG/S 1.6K"));
        assertTrue(summary, summary.contains("SENT 68.2K"));
        assertTrue(summary, summary.contains("ERR 2"));
        assertTrue(summary, summary.contains("NET↑ 4.2 KB/s"));
        String first = lines.get(2).toString();
        assertTrue(first, first.contains("1  plant.gsynth "));
        assertTrue(first, first.contains("00:04:12"));
        assertTrue(first, first.contains("820 msg/s"));
        assertTrue(first, first.contains("34.1K sent"));
        assertTrue(first, first.contains("20 tick/s"));
        assertTrue(lines.get(3).toString().contains("line 2.gsynth"));
    }

    @Test
    public void extraSimulationsAreSummedUpInOneLine() {
        List<SimulationSnapshot> running = new ArrayList<>();
        for (int id = 1; id <= 7; id++) {
            running.add(simulation(id, "p" + id + ".gsynth", SimulationSnapshot.Status.RUNNING, 0));
        }
        List<AttributedString> lines = StatusPanel.lines(running, USAGE, NOW, 120, 5);

        // Separator, summary, 4 simulations and "+3 more"
        assertEquals(7, lines.size());
        assertTrue(lines.get(5).toString().contains("p4.gsynth"));
        assertTrue(lines.get(6).toString(), lines.get(6).toString().contains("+3 more"));
    }

    @Test
    public void linesNeverReachTheLastColumn() {
        List<AttributedString> lines = StatusPanel.lines(
            List.of(simulation(1, "a-very-long-project-file-name-for-the-panel.gsynth", SimulationSnapshot.Status.RUNNING, 0)),
            USAGE, NOW, 40, 5);

        lines.forEach(line -> assertTrue(line.toString(), line.columnLength() <= 39));
        assertTrue(lines.get(2).toString(), lines.get(2).toString().contains("…"));
    }
}
