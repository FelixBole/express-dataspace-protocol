import {
	isValidNegotiationTransition,
	nextNegotiationState,
	InvalidNegotiationTransitionError,
} from "../../src/state-machines/negotiation.state-machine";
import { NegotiationState } from "../../src/types/negotiation";

describe("Negotiation State Machine", () => {
	// ---------------------------------------------------------------------------
	// isValidNegotiationTransition
	// ---------------------------------------------------------------------------

	describe("isValidNegotiationTransition()", () => {
		it("allows CONSUMER to send ContractRequestMessage on null (new negotiation)", () => {
			expect(
				isValidNegotiationTransition(
					null,
					"ContractRequestMessage",
					"CONSUMER",
				),
			).toBe(true);
		});

		it("rejects PROVIDER sending ContractRequestMessage on null", () => {
			expect(
				isValidNegotiationTransition(
					null,
					"ContractRequestMessage",
					"PROVIDER",
				),
			).toBe(false);
		});

		it("allows PROVIDER to send ContractOfferMessage on null (provider-initiated)", () => {
			expect(
				isValidNegotiationTransition(
					null,
					"ContractOfferMessage",
					"PROVIDER",
				),
			).toBe(true);
		});

		it("allows CONSUMER to send ContractRequestMessage on OFFERED (counter-offer)", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.OFFERED,
					"ContractRequestMessage",
					"CONSUMER",
				),
			).toBe(true);
		});

		it("rejects PROVIDER sending ContractRequestMessage on OFFERED", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.OFFERED,
					"ContractRequestMessage",
					"PROVIDER",
				),
			).toBe(false);
		});

		it("allows PROVIDER to counter-offer on REQUESTED", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.REQUESTED,
					"ContractOfferMessage",
					"PROVIDER",
				),
			).toBe(true);
		});

		it("allows CONSUMER to accept OFFERED negotiation", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.OFFERED,
					"ContractNegotiationEventMessage:ACCEPTED",
					"CONSUMER",
				),
			).toBe(true);
		});

		it("rejects PROVIDER accepting OFFERED negotiation", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.OFFERED,
					"ContractNegotiationEventMessage:ACCEPTED",
					"PROVIDER",
				),
			).toBe(false);
		});

		it("allows PROVIDER to send agreement after ACCEPTED", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.ACCEPTED,
					"ContractAgreementMessage",
					"PROVIDER",
				),
			).toBe(true);
		});

		it("allows PROVIDER to send agreement directly after REQUESTED (§7.1.2 shortcut)", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.REQUESTED,
					"ContractAgreementMessage",
					"PROVIDER",
				),
			).toBe(true);
		});

		it("allows CONSUMER to verify agreement after AGREED", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.AGREED,
					"ContractAgreementVerificationMessage",
					"CONSUMER",
				),
			).toBe(true);
		});

		it("allows PROVIDER to finalize after VERIFIED", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.VERIFIED,
					"ContractNegotiationEventMessage:FINALIZED",
					"PROVIDER",
				),
			).toBe(true);
		});

		it("allows termination from REQUESTED", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.REQUESTED,
					"ContractNegotiationTerminationMessage",
					"CONSUMER",
				),
			).toBe(true);
		});

		it("allows termination from OFFERED", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.OFFERED,
					"ContractNegotiationTerminationMessage",
					"PROVIDER",
				),
			).toBe(true);
		});

		it("rejects termination from FINALIZED (terminal state)", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.FINALIZED,
					"ContractNegotiationTerminationMessage",
					"CONSUMER",
				),
			).toBe(false);
		});

		it("rejects termination from TERMINATED (terminal state)", () => {
			expect(
				isValidNegotiationTransition(
					NegotiationState.TERMINATED,
					"ContractNegotiationTerminationMessage",
					"PROVIDER",
				),
			).toBe(false);
		});
	});

	// ---------------------------------------------------------------------------
	// nextNegotiationState - happy paths
	// ---------------------------------------------------------------------------

	describe("nextNegotiationState() - valid transitions", () => {
		it("returns REQUESTED when Consumer initiates", () => {
			expect(
				nextNegotiationState(
					null,
					"ContractRequestMessage",
					"CONSUMER",
				),
			).toBe(NegotiationState.REQUESTED);
		});

		it("returns OFFERED when Provider counter-offers on REQUESTED", () => {
			expect(
				nextNegotiationState(
					NegotiationState.REQUESTED,
					"ContractOfferMessage",
					"PROVIDER",
				),
			).toBe(NegotiationState.OFFERED);
		});

		it("returns ACCEPTED on consumer accept event", () => {
			expect(
				nextNegotiationState(
					NegotiationState.OFFERED,
					"ContractNegotiationEventMessage:ACCEPTED",
					"CONSUMER",
				),
			).toBe(NegotiationState.ACCEPTED);
		});

		it("returns AGREED when provider sends agreement from ACCEPTED", () => {
			expect(
				nextNegotiationState(
					NegotiationState.ACCEPTED,
					"ContractAgreementMessage",
					"PROVIDER",
				),
			).toBe(NegotiationState.AGREED);
		});

		it("returns AGREED when provider sends agreement directly from REQUESTED", () => {
			expect(
				nextNegotiationState(
					NegotiationState.REQUESTED,
					"ContractAgreementMessage",
					"PROVIDER",
				),
			).toBe(NegotiationState.AGREED);
		});

		it("returns VERIFIED when consumer verifies agreement", () => {
			expect(
				nextNegotiationState(
					NegotiationState.AGREED,
					"ContractAgreementVerificationMessage",
					"CONSUMER",
				),
			).toBe(NegotiationState.VERIFIED);
		});

		it("returns FINALIZED when provider sends finalized event", () => {
			expect(
				nextNegotiationState(
					NegotiationState.VERIFIED,
					"ContractNegotiationEventMessage:FINALIZED",
					"PROVIDER",
				),
			).toBe(NegotiationState.FINALIZED);
		});

		it("returns TERMINATED when consumer terminates from REQUESTED", () => {
			expect(
				nextNegotiationState(
					NegotiationState.REQUESTED,
					"ContractNegotiationTerminationMessage",
					"CONSUMER",
				),
			).toBe(NegotiationState.TERMINATED);
		});
	});

	// ---------------------------------------------------------------------------
	// nextNegotiationState - error paths
	// ---------------------------------------------------------------------------

	describe("nextNegotiationState() - invalid transitions", () => {
		it("throws InvalidNegotiationTransitionError when Provider sends agreement from null state", () => {
			expect(() =>
				nextNegotiationState(
					null,
					"ContractAgreementMessage",
					"PROVIDER",
				),
			).toThrow(InvalidNegotiationTransitionError);
		});

		it("throws on finalize from ACCEPTED (wrong order)", () => {
			expect(() =>
				nextNegotiationState(
					NegotiationState.ACCEPTED,
					"ContractNegotiationEventMessage:FINALIZED",
					"PROVIDER",
				),
			).toThrow(InvalidNegotiationTransitionError);
		});

		it("throws when Consumer tries to send agreement message", () => {
			expect(() =>
				nextNegotiationState(
					NegotiationState.ACCEPTED,
					"ContractAgreementMessage",
					"CONSUMER",
				),
			).toThrow(InvalidNegotiationTransitionError);
		});
	});
});
