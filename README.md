# RedFlag 🚩

Real-time risk monitoring for Aerodrome pool deployments on Base, powered by Ethos reputation scoring.

## Overview
RedFlag is a security-focused monitor designed to filter on-chain noise during new liquidity pool deployments. By integrating Ethos Network reputation data, the platform provides an instant visibility layer, helping users distinguish between verified builders and high-risk, anonymous deployments.

## Demo
🎥 [Watch the 2-minute project walkthrough](https://youtu.be/ybLhDGkyTZ4)

## The Problem
When new pools are deployed on Aerodrome (Base), there is often a lack of immediate information about the creator. Anonymous EOAs can deploy pools without any prior reputation, creating a high-risk environment for liquidity providers and traders.

## Our Solution: How it leverages Ethos
RedFlag connects real-time Aerodrome factory events with the Ethos reputation engine:
* Real-time Monitoring: Tracks every new pool deployment on the Aerodrome protocol.
* Identity Verification: Automatically fetches the creator's EOA reputation score from Ethos.
* Risk Classification: Signals low-risk deployments when a high Ethos score (e.g., 1400+) or verified identity is detected.
* Transparency: Surfaces structural signals (like first-ever deployments) backed by community reputation instead of just algorithmic guesses.

## Tech Stack
* Frontend: Next.js, Tailwind CSS
* Identity: Ethos Network (Reputation API & On-chain data)
* Network: Base
* DeFi Infrastructure: Aerodrome Protocol

---
Built for the Ethos Vibeathon 2026.
