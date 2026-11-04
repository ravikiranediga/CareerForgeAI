import unittest

from database.practice_seed import QUESTIONS


class PracticeSeedTests(unittest.TestCase):
    def test_every_coding_problem_has_samples_constraints_and_a_hint(self):
        coding_questions = [question for question in QUESTIONS if question["kind"] == "coding"]

        self.assertEqual(len(coding_questions), 30)
        for question in coding_questions:
            with self.subTest(title=question["title"]):
                for field in ("sample_input", "sample_output", "constraints_text", "hint"):
                    self.assertTrue(question.get(field), f"{question['title']} is missing {field}")


if __name__ == "__main__":
    unittest.main()
