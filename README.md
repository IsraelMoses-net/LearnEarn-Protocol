# LearnEarn Protocol

## Overview

LearnEarn is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses the real-world problem of high customer complaint volumes in industries like software, e-commerce, and services, where users often misuse products due to lack of knowledge. By providing crypto-incentivized training modules (virtual or in-person workshops), LearnEarn educates users, reduces support tickets, and fosters better user engagement.

Companies (admins) can create training modules or workshops. Users enroll, complete them, and earn fungible tokens (LEARN) as rewards. Upon completion, users receive NFT certificates. Rewards can be staked or redeemed for discounts/services. This incentivizes learning, leading to fewer complaints and better product adoption.

The project solves:
- **Customer Support Overload**: Educated users file fewer complaints.
- **User Retention**: Incentives encourage completion and loyalty.
- **Knowledge Gaps**: Modules cover product usage, best practices, etc.
- **Decentralized Education**: On-chain verification ensures tamper-proof certifications.

Key features:
- Virtual modules: On-chain progress tracking.
- In-person workshops: NFT tickets for attendance.
- Reward system: Tokens distributed based on completion.
- Integration: Companies can integrate with their apps via APIs.

The project consists of 7 Clarity smart contracts for security, modularity, and efficiency.

## Tech Stack
- **Blockchain**: Stacks (Bitcoin-secured).
- **Smart Contract Language**: Clarity (decidable, secure).
- **Token Standard**: SIP-10 for fungible tokens, SIP-09 for NFTs.
- **Frontend (not included)**: Can be built with React/Hiro Wallet for user interaction.
- **Deployment**: Use Stacks CLI for deployment to testnet/mainnet.

## Installation and Setup
1. Install Stacks CLI: `npm install -g @stacks/cli`.
2. Clone the repo: `git clone <repo-url>`.
3. Navigate to the project: `cd learnearn-protocol`.
4. Deploy contracts: Use `clarinet` for local testing or `stacks deploy` for network.
5. For local dev: Install Clarinet (`cargo install clarinet`), then `clarinet integrate`.

## Smart Contracts
Below are the 7 core smart contracts. Each is self-contained with traits for interoperability. Deploy in this order: IncentiveToken, CertificateNFT, ModuleRegistry, EnrollmentContract, ProgressTracker, RewardClaim, WorkshopManager.

### 1. IncentiveToken.clar (Fungible Token for Rewards)
This contract defines the LEARN token used for incentives.

```clarity
;; IncentiveToken.clar
(define-fungible-token learn-token u1000000000) ;; Total supply: 1 billion

(define-constant admin tx-sender)
(define-constant err-not-admin (err u100))
(define-constant err-transfer-failed (err u101))

(define-public (mint (amount uint) (recipient principal))
  (if (is-eq tx-sender admin)
    (ft-mint? learn-token amount recipient)
    err-not-admin
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal))
  (ft-transfer? learn-token amount sender recipient)
)

(define-read-only (get-balance (account principal))
  (ft-get-balance learn-token account)
)
```

### 2. CertificateNFT.clar (NFT for Completion Certificates)
Issues NFTs as proof of module/workshop completion.

```clarity
;; CertificateNFT.clar
(define-non-fungible-token certificate-nft uint)
(define-map nft-metadata uint { module-id: uint, user: principal, completion-date: uint })

(define-constant admin tx-sender)
(define-constant err-not-admin (err u200))
(define-constant err-invalid-id (err u201))

(define-data-var last-nft-id uint u0)

(define-public (mint (module-id uint) (recipient principal))
  (let ((new-id (+ (var-get last-nft-id) u1)))
    (if (is-eq tx-sender admin)
      (begin
        (nft-mint? certificate-nft new-id recipient)
        (map-set nft-metadata new-id { module-id: module-id, user: recipient, completion-date: block-height })
        (var-set last-nft-id new-id)
        (ok new-id)
      )
      err-not-admin
    )
  )
)

(define-read-only (get-metadata (nft-id uint))
  (map-get? nft-metadata nft-id)
)
```

### 3. ModuleRegistry.clar (Registry for Training Modules)
Admins register virtual modules with details.

```clarity
;; ModuleRegistry.clar
(define-map modules uint { name: (string-ascii 50), description: (string-ascii 200), reward-amount: uint, is-virtual: bool })
(define-map module-admins uint principal)

(define-constant admin tx-sender)
(define-constant err-not-admin (err u300))
(define-constant err-module-exists (err u301))

(define-data-var last-module-id uint u0)

(define-public (register-module (name (string-ascii 50)) (description (string-ascii 200)) (reward-amount uint) (is-virtual bool))
  (let ((new-id (+ (var-get last-module-id) u1)))
    (if (is-eq tx-sender admin)
      (begin
        (map-set modules new-id { name: name, description: description, reward-amount: reward-amount, is-virtual: is-virtual })
        (map-set module-admins new-id tx-sender)
        (var-set last-module-id new-id)
        (ok new-id)
      )
      err-not-admin
    )
  )
)

(define-read-only (get-module (module-id uint))
  (map-get? modules module-id)
)
```

### 4. EnrollmentContract.clar (User Enrollment)
Users enroll in modules or workshops.

```clarity
;; EnrollmentContract.clar
(use-trait module-registry-trait .ModuleRegistry.get-module) ;; Assume trait defined elsewhere

(define-map enrollments { user: principal, module-id: uint } bool)

(define-constant err-already-enrolled (err u400))
(define-constant err-not-enrolled (err u401))

(define-public (enroll (module-id uint))
  (let ((key { user: tx-sender, module-id: module-id }))
    (if (default-to false (map-get? enrollments key))
      err-already-enrolled
      (begin
        (map-set enrollments key true)
        (ok true)
      )
    )
  )
)

(define-read-only (is-enrolled (user principal) (module-id uint))
  (default-to false (map-get? enrollments { user: user, module-id: module-id }))
)
```

### 5. ProgressTracker.clar (Track User Progress)
Tracks completion of modules (virtual quizzes or in-person attendance).

```clarity
;; ProgressTracker.clar
(define-map progress { user: principal, module-id: uint } { completed: bool, score: uint })

(define-constant admin tx-sender)
(define-constant err-not-admin (err u500))
(define-constant err-not-enrolled (err u501))

(define-public (mark-completed (user principal) (module-id uint) (score uint))
  (if (is-eq tx-sender admin)
    (let ((key { user: user, module-id: module-id }))
      (if (is-enrolled user module-id) ;; Call from EnrollmentContract
        (begin
          (map-set progress key { completed: true, score: score })
          (ok true)
        )
        err-not-enrolled
      )
    )
    err-not-admin
  )
)

(define-read-only (get-progress (user principal) (module-id uint))
  (map-get? progress { user: user, module-id: module-id })
)
```

### 6. RewardClaim.clar (Claim Rewards)
Users claim tokens after completion.

```clarity
;; RewardClaim.clar
(use-trait incentive-token-trait .IncentiveToken.mint)
(use-trait progress-tracker-trait .ProgressTracker.get-progress)

(define-constant err-not-completed (err u600))
(define-constant err-already-claimed (err u601))

(define-map claimed { user: principal, module-id: uint } bool)

(define-public (claim-reward (module-id uint))
  (let ((key { user: tx-sender, module-id: module-id })
        (progress (unwrap! (get-progress tx-sender module-id) err-not-completed))
        (module (unwrap! (get-module module-id) err-invalid-id)))
    (if (and (get completed progress) (not (default-to false (map-get? claimed key))))
      (begin
        (try! (mint (get reward-amount module) tx-sender)) ;; Call mint from IncentiveToken
        (map-set claimed key true)
        (ok (get reward-amount module))
      )
      err-not-completed
    )
  )
)
```

### 7. WorkshopManager.clar (Manage In-Person/Virtual Workshops)
Handles workshop scheduling and attendance NFTs.

```clarity
;; WorkshopManager.clar
(use-trait certificate-nft-trait .CertificateNFT.mint)

(define-map workshops uint { module-id: uint, date: uint, location: (string-ascii 100), attendees: (list 100 principal) })

(define-constant admin tx-sender)
(define-constant err-not-admin (err u700))
(define-constant err-max-attendees (err u701))

(define-data-var last-workshop-id uint u0)

(define-public (schedule-workshop (module-id uint) (date uint) (location (string-ascii 100)))
  (if (is-eq tx-sender admin)
    (let ((new-id (+ (var-get last-workshop-id) u1)))
      (map-set workshops new-id { module-id: module-id, date: date, location: location, attendees: (list) })
      (var-set last-workshop-id new-id)
      (ok new-id)
    )
    err-not-admin
  )
)

(define-public (attend-workshop (workshop-id uint))
  (let ((workshop (unwrap! (map-get? workshops workshop-id) err-invalid-id))
        (attendees (get attendees workshop)))
    (if (< (len attendees) u100)
      (begin
        (map-set workshops workshop-id (merge workshop { attendees: (append attendees tx-sender) }))
        (try! (mint (get module-id workshop) tx-sender)) ;; Mint NFT
        (ok true)
      )
      err-max-attendees
    )
  )
)
```

## Usage
- Admins register modules/workshops.
- Users enroll, complete (via off-chain quizzes or attendance), claim rewards.
- Integrate with frontend for UI.

## Security Notes
- Clarity's decidability prevents reentrancy/loops.
- Use multisig for admin in production.
- Audit before mainnet.

## Contributing
Fork and PR. Issues welcome.

## License
MIT License.