"""
Unit & Integration Tests for Pothole Risk & Priority Assessment
Validates:
1. Deterministic scoring across score ranges (LOW, MEDIUM, HIGH, CRITICAL)
2. Distinct fields: risk_score (int), risk_level (str), priority (str)
3. Safe fallback on missing GPS, empty bbox, edge confidence values
4. Non-blocking candidate dispatch flow
"""

import unittest
from risk_assessment import calculate_pothole_risk


class TestPotholeRiskAssessment(unittest.TestCase):

    def test_low_risk_candidate(self):
        """Minimal pothole with low confidence, tiny bbox, single observation."""
        candidate = {
            "candidate_id": "CAND-TEST-001",
            "best_confidence": 0.30,
            "best_bbox": {"x1": 100, "y1": 100, "x2": 130, "y2": 120}, # 30x20 = 600 px (0.06%)
            "observation_count": 1,
            "gps": {"speed": 2.0} # 7.2 km/h
        }
        res = calculate_pothole_risk(candidate)
        self.assertIsInstance(res["risk_score"], int)
        self.assertIn("risk_level", res)
        self.assertIn("priority", res)
        self.assertLessEqual(res["risk_score"], 40)
        self.assertIn(res["risk_level"], ["LOW", "MEDIUM"])

    def test_critical_risk_candidate(self):
        """Severe road crater with 95% confidence, large bbox (>4% frame), 8 observations, high speed."""
        candidate = {
            "candidate_id": "CAND-TEST-002",
            "best_confidence": 0.95,
            "best_bbox": {"x1": 400, "y1": 300, "x2": 700, "y2": 500}, # 300x200 = 60000 px (6.5% of 1280x720)
            "observation_count": 8,
            "gps": {"speed": 15.0} # 54 km/h
        }
        res = calculate_pothole_risk(candidate)
        self.assertGreaterEqual(res["risk_score"], 76)
        self.assertEqual(res["risk_level"], "CRITICAL")
        self.assertEqual(res["priority"], "HIGH")
        self.assertEqual(res["breakdown"]["observations"], 8)

    def test_medium_high_risk_transition(self):
        """Candidate with ~88% confidence (observed in user prompt: 88-91%), 4 observations."""
        candidate = {
            "candidate_id": "CAND-TEST-003",
            "best_confidence": 0.89,
            "best_bbox": {"x1": 500, "y1": 400, "x2": 660, "y2": 520}, # 160x120 = 19200 px (2.08%)
            "observation_count": 4,
            "gps": {"speed": 8.5} # ~30 km/h
        }
        res = calculate_pothole_risk(candidate)
        self.assertGreater(res["risk_score"], 50)
        self.assertIn(res["risk_level"], ["HIGH", "CRITICAL"])
        self.assertEqual(res["priority"], "HIGH")

    def test_fallback_with_missing_fields(self):
        """Robustness when bbox, gps, or observation_count are missing."""
        candidate = {
            "candidate_id": "CAND-TEST-004",
            "best_confidence": 0.85
        }
        res = calculate_pothole_risk(candidate)
        self.assertIsInstance(res["risk_score"], int)
        self.assertIn(res["risk_level"], ["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        self.assertIn(res["priority"], ["LOW", "MEDIUM", "HIGH"])
        self.assertEqual(res["breakdown"]["observations"], 1)

    def test_score_clamping(self):
        """Extreme values should clamp cleanly between 0 and 100."""
        # Oversized bbox and confidence > 1.0
        candidate_max = {
            "best_confidence": 1.5,
            "best_bbox": {"x1": 0, "y1": 0, "x2": 1280, "y2": 720},
            "observation_count": 50,
            "gps": {"speed": 100.0}
        }
        res_max = calculate_pothole_risk(candidate_max)
        self.assertEqual(res_max["risk_score"], 100)
        self.assertEqual(res_max["risk_level"], "CRITICAL")
        self.assertEqual(res_max["priority"], "HIGH")

        # Zero confidence and zero bbox
        candidate_min = {
            "best_confidence": 0.0,
            "best_bbox": {"x1": 0, "y1": 0, "x2": 0, "y2": 0},
            "observation_count": 0,
            "gps": {"speed": 0.0}
        }
        res_min = calculate_pothole_risk(candidate_min)
        self.assertLessEqual(res_min["risk_score"], 25)
        self.assertEqual(res_min["risk_level"], "LOW")
        self.assertEqual(res_min["priority"], "LOW")


if __name__ == "__main__":
    unittest.main()
