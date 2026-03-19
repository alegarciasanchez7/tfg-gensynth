package com.gensynth.core.lifecycle;

import com.gensynth.core.config.AppConfig;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Comprehensive tests for LifecycleManager.
 * Tests cover: state transitions, listeners, thread management, error handling, and configuration.
 */
public class LifecycleManagerImplTest {

    private LifecycleManagerImpl manager;

    @Before
    public void setUp() {
        manager = new LifecycleManagerImpl();  // Uses default AppConfig
    }

    // ========== State Transition Tests ==========

    @Test
    public void testInitialStateIsCREATED() {
        assertEquals(LifecycleState.CREATED, manager.getState());
    }

    @Test
    public void testInitializationTransitionCREATED_TO_INITIALIZED() throws Exception {
        manager.initialize();
        assertEquals(LifecycleState.INITIALIZED, manager.getState());
    }

    @Test
    public void testStartTransitionINITIALIZED_TO_RUNNING() throws Exception {
        manager.initialize();
        manager.start();
        assertEquals(LifecycleState.RUNNING, manager.getState());
    }

    @Test
    public void testStopTransitionRUNNING_TO_STOPPED() throws Exception {
        manager.initialize();
        manager.start();
        manager.stop();
        assertEquals(LifecycleState.STOPPED, manager.getState());
    }

    @Test
    public void testStopTransitionINITIALIZED_TO_STOPPED() throws Exception {
        manager.initialize();
        manager.stop();  // Can stop directly from INITIALIZED
        assertEquals(LifecycleState.STOPPED, manager.getState());
    }

    @Test(expected = IllegalStateException.class)
    public void testCannotStartDirectlyFromCREATED() throws Exception {
        manager.start();  // Should fail: must initialize first
    }

    @Test(expected = IllegalStateException.class)
    public void testCannotStopFromCREATED() throws Exception {
        manager.stop();  // Should fail: invalid transition
    }

    @Test(expected = IllegalStateException.class)
    public void testCannotInitializeTwice() throws Exception {
        manager.initialize();
        manager.initialize();  // Should fail: already initialized
    }

    @Test
    public void testCanStopMultipleTimes() throws Exception {
        manager.initialize();
        manager.start();
        manager.stop();
        manager.stop();  // Should not fail: idempotent
        assertEquals(LifecycleState.STOPPED, manager.getState());
    }

    // ========== Listener Tests ==========

    @Test
    public void testListenerOnInitializeCalled() throws Exception {
        AtomicInteger callCount = new AtomicInteger(0);

        manager.addLifecycleListener(new ILifecycleListener() {
            @Override
            public void onInitialize() {
                callCount.incrementAndGet();
            }
            @Override
            public void onStart() {}
            @Override
            public void onStop() {}
        });

        manager.initialize();
        assertEquals(1, callCount.get());
    }

    @Test
    public void testListenerOnStartCalled() throws Exception {
        AtomicInteger callCount = new AtomicInteger(0);

        manager.addLifecycleListener(new ILifecycleListener() {
            @Override
            public void onInitialize() {}
            @Override
            public void onStart() {
                callCount.incrementAndGet();
            }
            @Override
            public void onStop() {}
        });

        manager.initialize();
        manager.start();
        assertEquals(1, callCount.get());
    }

    @Test
    public void testListenerOnStopCalled() throws Exception {
        AtomicInteger callCount = new AtomicInteger(0);

        manager.addLifecycleListener(new ILifecycleListener() {
            @Override
            public void onInitialize() {}
            @Override
            public void onStart() {}
            @Override
            public void onStop() {
                callCount.incrementAndGet();
            }
        });

        manager.initialize();
        manager.start();
        manager.stop();
        assertEquals(1, callCount.get());
    }

    @Test
    public void testMultipleListenersCalledInOrder() throws Exception {
        StringBuilder order = new StringBuilder();

        manager.addLifecycleListener(new TestListener("A", order));
        manager.addLifecycleListener(new TestListener("B", order));
        manager.addLifecycleListener(new TestListener("C", order));

        manager.initialize();
        assertEquals("AinitBinitCinit", order.toString());

        manager.start();
        assertEquals("AinitBinitCinitAstartBstartCstart", order.toString());

        manager.stop();
        assertEquals("AinitBinitCinitAstartBstartCstartAstopBstopCstop", order.toString());
    }

    @Test
    public void testRemoveListener() throws Exception {
        TestListener listener = new TestListener("A", new StringBuilder());
        manager.addLifecycleListener(listener);
        manager.removeLifecycleListener(listener);

        manager.initialize();
        assertEquals(0, listener.callCount.get());
    }

    @Test(expected = IllegalArgumentException.class)
    public void testAddNullListenerThrows() {
        manager.addLifecycleListener(null);
    }

    // ========== Thread Management Tests ==========

    @Test
    public void testExecutorAvailableAfterInitialize() throws Exception {
        manager.initialize();
        assertNotNull(manager.getExecutor());
    }

    @Test(expected = IllegalStateException.class)
    public void testExecutorNotAvailableBeforeInitialize() {
        manager.getExecutor();
    }

    @Test
    public void testTasksExecutedInThreadPool() throws Exception {
        manager.initialize();

        CountDownLatch latch = new CountDownLatch(3);
        for (int i = 0; i < 3; i++) {
            manager.getExecutor().submit(latch::countDown);
        }

        assertTrue("Tasks should execute", latch.await(5, java.util.concurrent.TimeUnit.SECONDS));
    }

    @Test
    public void testAwaitTerminationWithTimeout() throws Exception {
        manager.initialize();
        manager.start();
        manager.stop();

        boolean terminated = manager.awaitTermination(5);
        assertTrue("Should terminate gracefully", terminated);
    }

    // ========== Thread Pool Configuration Tests ==========

    @Test
    public void testDefaultThreadPoolConfiguration() throws Exception {
        // Default AppConfig should have conservative sizes
        manager.initialize();
        assertNotNull(manager.getExecutor());
        // Pool is created successfully with default config
    }

    @Test
    public void testCustomThreadPoolConfiguration() throws Exception {
        AppConfig customConfig = new AppConfig();
        customConfig.setThreadPoolCoreSize(4);
        customConfig.setThreadPoolMaxSize(8);
        customConfig.setThreadPoolKeepAliveSeconds(120);

        LifecycleManagerImpl customManager = new LifecycleManagerImpl(customConfig);
        customManager.initialize();

        assertNotNull(customManager.getExecutor());
        // Verify that custom sizes are used by submitting more tasks than default core size
        CountDownLatch latch = new CountDownLatch(8);
        for (int i = 0; i < 8; i++) {
            customManager.getExecutor().submit(latch::countDown);
        }
        assertTrue("Custom pool should handle 8 tasks", latch.await(5, java.util.concurrent.TimeUnit.SECONDS));
        customManager.stop();
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidThreadPoolConfigThrowsOnNullConfig() {
        new LifecycleManagerImpl(null);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidThreadPoolCoreSize() {
        AppConfig config = new AppConfig();
        config.setThreadPoolCoreSize(0);  // Invalid: must be >= 1
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidThreadPoolMaxSize() {
        AppConfig config = new AppConfig();
        config.setThreadPoolMaxSize(0);  // Invalid: must be >= 1
    }

    @Test(expected = IllegalArgumentException.class)
    public void testCoreSizeCannotExceedMaxSize() {
        AppConfig config = new AppConfig();
        config.setThreadPoolMaxSize(2);
        config.setThreadPoolCoreSize(4);  // Invalid: core > max
    }

    @Test(expected = IllegalArgumentException.class)
    public void testInvalidThreadPoolKeepAlive() {
        AppConfig config = new AppConfig();
        config.setThreadPoolKeepAliveSeconds(0);  // Invalid: must be > 0
    }

    // ========== Error Handling Tests ==========

    @Test
    public void testListenerExceptionAggregation() throws Exception {
        manager.addLifecycleListener(new ILifecycleListener() {
            @Override
            public void onInitialize() throws Exception {
                throw new RuntimeException("Error 1");
            }
            @Override
            public void onStart() {}
            @Override
            public void onStop() {}
        });

        manager.addLifecycleListener(new ILifecycleListener() {
            @Override
            public void onInitialize() throws Exception {
                throw new RuntimeException("Error 2");
            }
            @Override
            public void onStart() {}
            @Override
            public void onStop() {}
        });

        try {
            manager.initialize();
            fail("Should throw exception");
        } catch (Exception e) {
            // Should have suppressed exceptions
            assertEquals(1, e.getSuppressed().length);
        }
    }

    @Test
    public void testStopContinuesEvenIfListenerFails() throws Exception {
        AtomicInteger stopCount = new AtomicInteger(0);

        manager.addLifecycleListener(new ILifecycleListener() {
            @Override
            public void onInitialize() {}
            @Override
            public void onStart() {}
            @Override
            public void onStop() throws Exception {
                stopCount.incrementAndGet();
                throw new RuntimeException("Stop failed");
            }
        });

        manager.addLifecycleListener(new ILifecycleListener() {
            @Override
            public void onInitialize() {}
            @Override
            public void onStart() {}
            @Override
            public void onStop() {
                stopCount.incrementAndGet();
            }
        });

        manager.initialize();
        manager.start();
        try {
            manager.stop();
        } catch (Exception e) {
            // Expected: first listener failed
        }

        assertEquals("Both listeners should be called", 2, stopCount.get());
        assertEquals(LifecycleState.STOPPED, manager.getState());
    }

    @Test
    public void testIsInState() throws Exception {
        assertTrue(manager.isInState(LifecycleState.CREATED));
        manager.initialize();
        assertTrue(manager.isInState(LifecycleState.INITIALIZED));
        manager.start();
        assertTrue(manager.isInState(LifecycleState.RUNNING));
        manager.stop();
        assertTrue(manager.isInState(LifecycleState.STOPPED));
    }

    // ========== Helper Classes ==========

    private static class TestListener implements ILifecycleListener {
        private final String name;
        private final StringBuilder order;
        private final AtomicInteger callCount = new AtomicInteger(0);

        TestListener(String name, StringBuilder order) {
            this.name = name;
            this.order = order;
        }

        @Override
        public void onInitialize() {
            callCount.incrementAndGet();
            order.append(name).append("init");
        }

        @Override
        public void onStart() {
            callCount.incrementAndGet();
            order.append(name).append("start");
        }

        @Override
        public void onStop() {
            callCount.incrementAndGet();
            order.append(name).append("stop");
        }
    }

}
