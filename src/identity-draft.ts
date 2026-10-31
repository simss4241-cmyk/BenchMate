export type PhotoReview = {
  photo: string;
  model: string;
  createdAt: string;
  candidateName: string;
  markings: string;
  markingsStatus: "readable" | "unreadable" | "not_visible";
  evidence: string;
  uncertainty: string;
};
export type IdentityProposal = PhotoReview & {
  itemId: string | null;
  baseUpdatedAt: string | null;
};
type IdentityRecord = {
  identity?: string;
  photo?: string | null;
  photoReview?: Pick<PhotoReview, "photo" | "candidateName">;
  reviewPending?: boolean;
};
export function identityStatus(record?: IdentityRecord) {
  if (record?.identity === "confirmed")
    return {
      stage: "confirmed",
      label: "User-confirmed identity",
      needsIdentification: false,
    };
  const currentReview = Boolean(
    record?.photo && record.photoReview?.photo === record.photo,
  );
  if (currentReview && record?.reviewPending)
    return {
      stage: "uncertain",
      label: "Review identification",
      needsIdentification: true,
    };
  if (currentReview && record?.photoReview?.candidateName.trim())
    return {
      stage: "identified",
      label: "Identified from photo",
      needsIdentification: false,
    };
  if (currentReview)
    return {
      stage: "uncertain",
      label: "Photo reviewed · ID unclear",
      needsIdentification: true,
    };
  return {
    stage: "uncertain",
    label: "Needs identification",
    needsIdentification: true,
  };
}
type Draft = {
  id?: string;
  name: string;
  photo: string | null;
  markings: string;
  evidence: string;
  updatedAt?: string;
  expectedUpdatedAt?: string;
};
export function applyIdentityProposal<T extends Draft>(
  draft: T,
  proposal: IdentityProposal,
) {
  if ((draft.id || null) !== proposal.itemId || draft.photo !== proposal.photo)
    throw new Error("This photo review belongs to a different item or photo.");
  if (
    draft.id &&
    (draft.expectedUpdatedAt || draft.updatedAt) !== proposal.baseUpdatedAt
  )
    throw new Error(
      "The item changed during photo review. Reopen it before applying the proposal.",
    );
  const { itemId, baseUpdatedAt, ...photoReview } = proposal;
  return {
    ...draft,
    reviewPending: true,
    name: draft.name.trim() ? draft.name : proposal.candidateName,
    photoReview,
    ...(draft.id ? { expectedUpdatedAt: baseUpdatedAt! } : {}),
    markings: proposal.markings || draft.markings,
    evidence:
      draft.evidence ||
      `Photo observation (${proposal.model}): ${proposal.evidence}\nUncertainty: ${proposal.uncertainty}`.slice(
        0,
        6000,
      ),
  };
}
