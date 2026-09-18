import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationAudioEngine } from '../src/engine/audio_synth.js';
import { SimulationEngine } from '../src/engine/simulation_engine.js';
import { generateFacilityTopology } from '../src/engine/topology_generator.js';
import { SEED_ROBOTS } from '../src/data/robots.seed.js';
import type { FacilityRequirements } from '../src/types/facility.js';

// Setup Mock AudioContext for Node.js test environment
function setupMockAudioContext() {
  class MockNode {
    connect() {}
    disconnect() {}
  }

  class MockGainNode extends MockNode {
    gain = {
      value: 1,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    };
  }

  class MockOscillatorNode extends MockNode {
    type = 'sine';
    frequency = {
      value: 440,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    };
    start() {}
    stop() {}
  }

  class MockAudioContext {
    state = 'suspended';
    currentTime = 0;
    destination = new MockNode();

    createGain() {
      return new MockGainNode();
    }

    createOscillator() {
      return new MockOscillatorNode();
    }

    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
  }

  (globalThis as unknown as { window: Record<string, unknown> }).window = {
    AudioContext: MockAudioContext as unknown as typeof AudioContext,
  };
}

test('Audio Synth: Singleton instance and initial volume settings', () => {
  setupMockAudioContext();

  const synth1 = SimulationAudioEngine.getInstance();
  const synth2 = SimulationAudioEngine.getInstance();

  assert.equal(synth1, synth2, 'SimulationAudioEngine should be a Singleton');

  synth1.setVolume(0.8);
  assert.equal(synth1.getVolume(), 0.8);

  synth1.toggleMute(true);
  assert.equal(synth1.isMuted(), true);

  synth1.toggleMute(false);
  assert.equal(synth1.isMuted(), false);
});

test('Audio Synth: Triggers procedural sound effects without throwing errors', () => {
  setupMockAudioContext();

  const synth = SimulationAudioEngine.getInstance();
  synth.setVolume(0.5);
  synth.toggleMute(false);

  // Calling sound triggers
  assert.doesNotThrow(() => synth.playChargeStart());
  assert.doesNotThrow(() => synth.playChargeEnd());
  assert.doesNotThrow(() => synth.playBoxPick());
  assert.doesNotThrow(() => synth.playBoxDrop());
  assert.doesNotThrow(() => synth.playBrake());
});

test('Replay Buffer: Populates exactly 7200 frames in 1-hour simulation', () => {
  const mockFacility: FacilityRequirements = {
    industry: 'warehouse',
    totalAreaSqm: 2000,
    aisleWidthM: 2.5,
    ceilingHeightM: 6.0,
    operatingTempRange: { min: 10, max: 25 },
    shiftsPerDay: 2,
    hoursPerDay: 16,
    requiredPayloadKg: 800,
    targetThroughputPerHour: 40,
    averageWorkerSalaryRub: 80000,
  };

  const topology = generateFacilityTopology(mockFacility);
  const robot = SEED_ROBOTS[0];
  const engine = new SimulationEngine(topology, robot, 3);

  const result = engine.runOneHourSimulation(40, true);

  assert.equal(result.totalTicks, 7200);
  assert.equal(engine.replayFrames.length, 7200, 'Replay buffer should contain exactly 7200 frames');

  // Verify timestamps and structure
  assert.equal(engine.replayFrames[0].timestampSec, 0);
  assert.equal(engine.replayFrames[1].timestampSec, 0.5);
  assert.equal(engine.replayFrames[7199].timestampSec, 3599.5);

  // Verify agent snapshots structure
  const frame0 = engine.replayFrames[0];
  assert.equal(frame0.agents.length, 3);
  assert.ok('x' in frame0.agents[0]);
  assert.ok('y' in frame0.agents[0]);
  assert.ok('headingRad' in frame0.agents[0]);
  assert.ok('state' in frame0.agents[0]);
  assert.ok('batterySoc' in frame0.agents[0]);
  assert.ok('cargoPayload' in frame0.agents[0]);
});
