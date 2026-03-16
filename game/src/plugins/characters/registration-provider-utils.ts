export interface RegistrationProviderSubjectState {
  alive: boolean;
  drunk: boolean;
  poisoned: boolean;
}

export function can_apply_registration_provider(
  subject: RegistrationProviderSubjectState
): boolean {
  if (!subject.alive) {
    return true;
  }
  return !subject.drunk && !subject.poisoned;
}
