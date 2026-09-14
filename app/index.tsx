import { Redirect } from 'expo-router';

/**
 * Entry point.
 *
 * Will become `REST-AUTH-01` Splash (§23A.5): restore the session, call
 * `/auth/me`, and route to the restaurant or supplier experience based on the
 * **server's** answer about org/store membership and role — never on cached
 * client state. Until authentication lands (build sequence step 4), this routes
 * to the design-system gallery so the repo has something to run.
 */
export default function Index() {
  return <Redirect href="/design-system" />;
}
