import type {
  InputMode,
  PlatformKey,
  RepurposeResult,
  ToneKey
} from "../../components/recontent/types";

export type WorkspaceDraftSnapshot = {
  campaignId?: string | null;
  inputMode: InputMode;
  sourceText: string;
  sourceUrl: string;
  selectedPlatform: PlatformKey;
  tone: ToneKey;
  customInstruction: string;
  results: RepurposeResult[];
  activePlatform: PlatformKey | null;
};

export type WorkspaceDraftRecord = WorkspaceDraftSnapshot & {
  campaignName?: string | null;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};
