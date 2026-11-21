/**
 * Communication bridge with the Java core
 * 
 * This module handles bidirectional communication between the React UI
 * and the Java core. It supports two communication modes:
 * 
 * 1. WebSocket: For when the UI runs in an external browser or in development
 * 2. JCEF Bridge: Direct communication when embedded in JCEF
 */

export type { BridgeConfig } from './bridge/BridgeConfig';
export { CoreCommands } from './bridge/CoreCommands';
import { CoreBridge } from './bridge/CoreBridge';

export const bridge = new CoreBridge();
export default bridge;
