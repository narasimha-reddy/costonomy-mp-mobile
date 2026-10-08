// @testing-library/react-native v13 registers its Jest matchers automatically,
// so there is nothing to import for those. This file exists for global test
// setup that later component tests will need (fake timers, provider wrappers).
import { resetAttemptKeys } from '@/lib/credit/attemptKeys';

// The credit attempt keys live in a module-level store; never let one test's
// undecided attempt leak its key into the next.
afterEach(() => { resetAttemptKeys(); });

// The native storage module does not exist under Jest; the checkout remembers its choices through it. The official
// in-memory mock keeps every screen test that reaches `lib/preferences` loadable (tests that care mock the helper itself).
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
