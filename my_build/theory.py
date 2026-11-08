"""
M1: Grover theory as code.

|s> = sin(θ)|w> + cos(θ)|w⊥>,  sin(θ) = sqrt(M/N)
After k iterations of (diffuser · oracle), the state sits at angle (2k+1)θ from |w⊥>, so
    P(found) = sin²((2k+1)θ)

Fill in the TODOs, then run:  python theory.py
"""
import math


def theta(N, M):
    # TODO: return θ in radians. Hint: sin θ = sqrt(M/N), so use math.asin.
    raise NotImplementedError


def theory_success(N, M, k):
    # TODO: P(found) after k Grover iterations.
    raise NotImplementedError


def best_k(N, M):
    # TODO: the integer k that makes (2k+1)θ closest to π/2.
    # Hint: solve (2k+1)θ = π/2 for k, then round. It can't be negative.
    raise NotImplementedError


if __name__ == "__main__":
    # Compare these with your hand calculations.
    for N, M in [(4, 1), (16, 1), (16, 2), (16, 4), (16, 8), (64, 1), (64, 2)]:
        k = best_k(N, M)
        print(f"N={N:3d} M={M}  θ={math.degrees(theta(N, M)):6.2f}°  "
              f"best k={k}  P={theory_success(N, M, k):.3f}")
