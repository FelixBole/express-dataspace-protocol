import {
  isValidTransferTransition,
  nextTransferState,
  InvalidTransferTransitionError,
} from '../../src/state-machines/transfer.state-machine';
import { TransferState } from '../../src/types/transfer';

describe('Transfer State Machine', () => {
  // ---------------------------------------------------------------------------
  // isValidTransferTransition
  // ---------------------------------------------------------------------------

  describe('isValidTransferTransition()', () => {
    it('allows CONSUMER to send TransferRequestMessage on null (new transfer)', () => {
      expect(isValidTransferTransition(null, 'TransferRequestMessage', 'CONSUMER')).toBe(true);
    });

    it('rejects PROVIDER initiating transfer request', () => {
      expect(isValidTransferTransition(null, 'TransferRequestMessage', 'PROVIDER')).toBe(false);
    });

    it('allows PROVIDER to start after REQUESTED', () => {
      expect(
        isValidTransferTransition(TransferState.REQUESTED, 'TransferStartMessage', 'PROVIDER')
      ).toBe(true);
    });

    it('rejects CONSUMER starting a fresh REQUESTED transfer', () => {
      expect(
        isValidTransferTransition(TransferState.REQUESTED, 'TransferStartMessage', 'CONSUMER')
      ).toBe(false);
    });

    it('allows CONSUMER to restart after SUSPENDED', () => {
      expect(
        isValidTransferTransition(TransferState.SUSPENDED, 'TransferStartMessage', 'CONSUMER')
      ).toBe(true);
    });

    it('allows PROVIDER to restart after SUSPENDED', () => {
      expect(
        isValidTransferTransition(TransferState.SUSPENDED, 'TransferStartMessage', 'PROVIDER')
      ).toBe(true);
    });

    it('allows either to complete from STARTED', () => {
      expect(
        isValidTransferTransition(TransferState.STARTED, 'TransferCompletionMessage', 'CONSUMER')
      ).toBe(true);
      expect(
        isValidTransferTransition(TransferState.STARTED, 'TransferCompletionMessage', 'PROVIDER')
      ).toBe(true);
    });

    it('allows either to suspend from STARTED', () => {
      expect(
        isValidTransferTransition(TransferState.STARTED, 'TransferSuspensionMessage', 'CONSUMER')
      ).toBe(true);
      expect(
        isValidTransferTransition(TransferState.STARTED, 'TransferSuspensionMessage', 'PROVIDER')
      ).toBe(true);
    });

    it('allows termination from REQUESTED', () => {
      expect(
        isValidTransferTransition(TransferState.REQUESTED, 'TransferTerminationMessage', 'CONSUMER')
      ).toBe(true);
    });

    it('allows termination from STARTED', () => {
      expect(
        isValidTransferTransition(TransferState.STARTED, 'TransferTerminationMessage', 'PROVIDER')
      ).toBe(true);
    });

    it('allows termination from SUSPENDED', () => {
      expect(
        isValidTransferTransition(
          TransferState.SUSPENDED,
          'TransferTerminationMessage',
          'CONSUMER'
        )
      ).toBe(true);
    });

    it('rejects termination from COMPLETED (terminal state)', () => {
      expect(
        isValidTransferTransition(
          TransferState.COMPLETED,
          'TransferTerminationMessage',
          'CONSUMER'
        )
      ).toBe(false);
    });

    it('rejects termination from TERMINATED (terminal state)', () => {
      expect(
        isValidTransferTransition(
          TransferState.TERMINATED,
          'TransferTerminationMessage',
          'PROVIDER'
        )
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // nextTransferState — happy paths
  // ---------------------------------------------------------------------------

  describe('nextTransferState() — valid transitions', () => {
    it('returns REQUESTED when consumer initiates', () => {
      expect(nextTransferState(null, 'TransferRequestMessage', 'CONSUMER')).toBe(
        TransferState.REQUESTED
      );
    });

    it('returns STARTED when provider starts', () => {
      expect(
        nextTransferState(TransferState.REQUESTED, 'TransferStartMessage', 'PROVIDER')
      ).toBe(TransferState.STARTED);
    });

    it('returns SUSPENDED from STARTED', () => {
      expect(
        nextTransferState(TransferState.STARTED, 'TransferSuspensionMessage', 'PROVIDER')
      ).toBe(TransferState.SUSPENDED);
    });

    it('returns STARTED again from SUSPENDED (restart)', () => {
      expect(
        nextTransferState(TransferState.SUSPENDED, 'TransferStartMessage', 'CONSUMER')
      ).toBe(TransferState.STARTED);
    });

    it('returns COMPLETED from STARTED', () => {
      expect(
        nextTransferState(TransferState.STARTED, 'TransferCompletionMessage', 'CONSUMER')
      ).toBe(TransferState.COMPLETED);
    });

    it('returns TERMINATED from STARTED', () => {
      expect(
        nextTransferState(TransferState.STARTED, 'TransferTerminationMessage', 'PROVIDER')
      ).toBe(TransferState.TERMINATED);
    });
  });

  // ---------------------------------------------------------------------------
  // nextTransferState — error paths
  // ---------------------------------------------------------------------------

  describe('nextTransferState() — invalid transitions', () => {
    it('throws InvalidTransferTransitionError on bad transition', () => {
      expect(() =>
        nextTransferState(null, 'TransferCompletionMessage', 'CONSUMER')
      ).toThrow(InvalidTransferTransitionError);
    });

    it('throws when completing from REQUESTED (not yet started)', () => {
      expect(() =>
        nextTransferState(TransferState.REQUESTED, 'TransferCompletionMessage', 'CONSUMER')
      ).toThrow(InvalidTransferTransitionError);
    });

    it('throws when provider tries to initiate request', () => {
      expect(() =>
        nextTransferState(null, 'TransferRequestMessage', 'PROVIDER')
      ).toThrow(InvalidTransferTransitionError);
    });
  });
});
