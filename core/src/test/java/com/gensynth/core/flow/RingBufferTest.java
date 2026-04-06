package com.gensynth.core.flow;

import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.*;

/**
 * Tests for RingBuffer lock-free circular buffer implementation.
 */
public class RingBufferTest {
    
    private RingBuffer<String> buffer;

    @Before
    public void setUp() {
        buffer = new RingBuffer<>(1024);
    }

    /**
     * Test: Basic write and read operations
     */
    @Test
    public void testBasicWriteAndRead() {
        assertTrue(buffer.write("event1"));
        assertTrue(buffer.write("event2"));
        
        assertEquals(2, buffer.size());
        assertEquals("event1", buffer.read());
        assertEquals("event2", buffer.read());
        assertEquals(0, buffer.size());
    }

    /**
     * Test: Write to capacity and trigger backpressure
     */
    @Test
    public void testBackpressure() {
        // Get capacity (rounded to power of 2)
        int capacity = buffer.getCapacity();
        
        // Fill buffer to capacity - 1 (one slot reserved for wrap detection)
        for (int i = 0; i < capacity - 1; i++) {
            assertTrue("Should write element " + i, buffer.write("event" + i));
        }
        
        // Buffer should be almost full
        assertEquals(capacity - 1, buffer.size());
        
        // Next write should fail (backpressure)
        assertFalse("Should reject write when almost full", buffer.write("overflow"));
        assertEquals(1, buffer.getRejectedWrites());
        
        // After reading one, should accept one more
        String read = buffer.read();
        assertNotNull(read);
        assertTrue("Should accept write after read", buffer.write("event_new"));
    }

    /**
     * Test: Power of 2 capacity rounding
     */
    @Test
    public void testCapacityRounding() {
        RingBuffer<String> buf1 = new RingBuffer<>(100);
        assertEquals(128, buf1.getCapacity());  // Rounds up to 128
        
        RingBuffer<String> buf2 = new RingBuffer<>(256);
        assertEquals(256, buf2.getCapacity());  // Already power of 2
        
        RingBuffer<String> buf3 = new RingBuffer<>(1000);
        assertEquals(1024, buf3.getCapacity());  // Rounds up to 1024
    }

    /**
     * Test: Occupancy percentage calculation
     */
    @Test
    public void testOccupancy() {
        assertEquals(0.0, buffer.occupancyPercent(), 0.01);
        
        buffer.write("event1");
        buffer.write("event2");
        
        // 2 out of 1024 = ~0.195%
        assertTrue(buffer.occupancyPercent() > 0);
        
        // Fill half
        for (int i = 0; i < buffer.getCapacity() / 2; i++) {
            buffer.write("event" + i);
        }
        
        double occupancy = buffer.occupancyPercent();
        assertTrue(occupancy >= 45 && occupancy <= 55);  // ~50%
    }

    /**
     * Test: Empty buffer returns null on read
     */
    @Test
    public void testEmptyBufferRead() {
        assertTrue(buffer.isEmpty());
        assertNull(buffer.read());
        assertNull(buffer.read());
    }

    /**
     * Test: Metrics tracking
     */
    @Test
    public void testMetrics() {
        assertEquals(0, buffer.getTotalWritten());
        assertEquals(0, buffer.getTotalRead());
        assertEquals(0, buffer.getRejectedWrites());
        
        // Write 10 elements
        for (int i = 0; i < 10; i++) {
            buffer.write("event" + i);
        }
        assertEquals(10, buffer.getTotalWritten());
        
        // Read 5 elements
        for (int i = 0; i < 5; i++) {
            buffer.read();
        }
        assertEquals(5, buffer.getTotalRead());
        
        // Verify remaining
        assertEquals(5, buffer.size());
    }

    /**
     * Test: Circular wrap-around
     */
    @Test
    public void testWrapAround() {
        int capacity = buffer.getCapacity();
        
        // Write more than capacity (simulating wrap-around)
        for (int i = 0; i < capacity * 2; i++) {
            String event = "event" + i;
            
            // If buffer full, read one first
            if (!buffer.write(event)) {
                assertNotNull(buffer.read());
                assertTrue(buffer.write(event));  // Retry should succeed
            }
        }
        
        // Verify still works after wrap-around
        assertTrue(buffer.getTotalWritten() > capacity);
    }

    /**
     * Test: Null element rejection
     */
    @Test(expected = IllegalArgumentException.class)
    public void testNullElementRejection() {
        buffer.write(null);
    }

    /**
     * Test: Consecutive reads empty buffer properly
     */
    @Test
    public void testConsecutiveReads() {
        buffer.write("event1");
        buffer.write("event2");
        buffer.write("event3");
        
        assertEquals("event1", buffer.read());
        assertEquals("event2", buffer.read());
        assertEquals("event3", buffer.read());
        
        // Buffer should be empty
        assertTrue(buffer.isEmpty());
        assertNull(buffer.read());
    }

    /**
     * Test: isFull() method
     */
    @Test
    public void testIsFull() {
        assertFalse(buffer.isFull());
        
        int capacity = buffer.getCapacity();
        // Fill to capacity - 1
        for (int i = 0; i < capacity - 1; i++) {
            buffer.write("event" + i);
        }
        
        assertTrue(buffer.isFull());
        
        buffer.read();
        assertFalse(buffer.isFull());
    }

    /**
     * Test: High-volume write/read simulation
     */
    @Test
    public void testHighVolume() {
        int iterations = 100_000;
        
        for (int i = 0; i < iterations; i++) {
            // Keep trying to write until successful
            while (!buffer.write("event" + i)) {
                // Buffer full, read half to make space
                for (int j = 0; j < buffer.getCapacity() / 2; j++) {
                    buffer.read();
                }
            }
        }
        
        // Verify all events were written
        assertEquals(iterations, buffer.getTotalWritten());
    }

    /**
     * Test: toString() output
     */
    @Test
    public void testToString() {
        buffer.write("event1");
        buffer.write("event2");
        
        String str = buffer.toString();
        assertTrue(str.contains("RingBuffer"));
        assertTrue(str.contains("capacity"));
        assertTrue(str.contains("size"));
        assertTrue(str.contains("occupancy"));
    }
}
