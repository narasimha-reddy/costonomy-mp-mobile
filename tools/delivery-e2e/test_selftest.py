import os, subprocess, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))

def run(env):
    e = {k: v for k, v in os.environ.items() if k not in ('API', 'WEB', 'MYSQL_CMD')}
    e.update(env)
    return subprocess.run([sys.executable, os.path.join(HERE, 'driver.py'), '--self-test'], capture_output=True, text=True, env=e)

class SelfTest(unittest.TestCase):
    def test_defaults_pass(self):
        r = run({})
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn('7080', r.stdout)
    def test_forbidden_ports_fail(self):
        for env in ({'API': 'http://localhost:7070/costonomy-mp-api'}, {'WEB': 'http://localhost:7071'},
                    {'MYSQL_CMD': 'mysql -h127.0.0.1 -P3306 x'}, {'MYSQL_CMD': 'mysql -uroot x'}):
            self.assertEqual(run(env).returncode, 1, env)
    def test_secret_not_printed(self):
        r = run({'PIDGE_WEBHOOK_SECRET': 'sekrit-value'})
        self.assertNotIn('sekrit-value', r.stdout + r.stderr)

if __name__ == '__main__':
    unittest.main()
