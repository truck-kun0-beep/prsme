/**
 * Phase 4 — selected media item model.
 *
 * This is the shape stored on a `ProfileDraft` after the user has picked a
 * record from a provider search. It mirrors `MediaRecord` closely (same
 * provider identifiers) so the studio, the picker, and the public profile
 * agree on identity without round-tripping through a heavy catalogue.
 *
 * Reviews are part of the same record: `myRating`, `myReviewTitle`,
 * `myReview`, `myReviewSpoiler`. Reviews are pure owner data — they never
 * flow back to the provider.
 */

import type {
  MediaProviderId,
  MediaKindId,
} from "./media/types";

/** Allow-list mirroring `MediaKindId` but kept here for symmetry. */
export type SelectedMediaKind = MediaKindId;

export interface SelectedMediaItem {
  /** PRSME-selected identity. Always `media:<uuid>` so we can spot it. */
  id: string;

  /** What the picker chose. */
  kind: SelectedMediaKind;

  /** Provider identity — never lies about where the metadata came from. */
  provider: MediaProviderId;
  providerId: string;

  /** Display fields the catalogue produced. */
  title: string;
  alternateTitle?: string;
  /** Director / artist / author / lead actor (depends on `kind`). */
  creator?: string;
  creatorRole?: string;
  year?: number;
  /** Artwork URL or null when the provider has none. */
  coverUrl: string | null;
  coverSource?: string;
  externalUrl?: string;
  description?: string;

  /** Owner-edited portion — reviews. Never persisted by a provider. */
  myRating?: number;
  myReviewTitle?: string;
  myReview?: string;
  myReviewSpoiler?: boolean;
  /** ISO timestamp the user last updated their review. Demo-only precision. */
  myReviewUpdatedAt?: string;
}