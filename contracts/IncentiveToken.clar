;; IncentiveToken.clar
;; Sophisticated fungible token for LearnEarn rewards with admin controls, pausing, multiple minters,
;; mint records with metadata, burning, transfer allowances, blacklisting, and event emissions.
;; Follows SIP-10 standard with extensions for educational incentives.

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-PAUSED (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-INVALID-RECIPIENT (err u103))
(define-constant ERR-INVALID-MINTER (err u104))
(define-constant ERR-ALREADY-REGISTERED (err u105))
(define-constant ERR-METADATA-TOO-LONG (err u106))
(define-constant ERR-INSUFFICIENT-BALANCE (err u107))
(define-constant ERR-INSUFFICIENT-ALLOWANCE (err u108))
(define-constant ERR-BLACKLISTED (err u109))
(define-constant ERR-INVALID-SPENDER (err u110))

(define-constant MAX-METADATA-LEN u500)
(define-constant TOKEN-NAME "LEARN")
(define-constant TOKEN-SYMBOL "LRN")
(define-constant TOKEN-DECIMALS u6)
(define-constant INITIAL-ADMIN tx-sender)

(define-fungible-token learn-token u1000000000000) ;; 1 trillion max supply

(define-data-var contract-paused bool false)
(define-data-var contract-admin principal INITIAL-ADMIN)
(define-data-var total-supply uint u0)

(define-map minters principal bool)
(define-map blacklisted principal bool)
(define-map allowances { owner: principal, spender: principal } uint)
(define-map mint-records uint { minter: principal, recipient: principal, amount: uint, metadata: (string-utf8 500), timestamp: uint })
(define-data-var mint-counter uint u0)

;; Events (emulated via prints for now, as Clarity doesn't have native events)
(define-private (emit-event (event-name (string-ascii 50)) (data (string-utf8 500)))
  (print { event: event-name, data: data }))

;; Admin functions
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED)
    (var-set contract-admin new-admin)
    (emit-event "admin-changed" (concat "New admin: " (principal-to-string new-admin)))
    (ok true)
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED)
    (var-set contract-paused true)
    (emit-event "contract-paused" "Contract operations paused")
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED)
    (var-set contract-paused false)
    (emit-event "contract-unpaused" "Contract operations resumed")
    (ok true)
  )
)

(define-public (add-minter (minter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED)
    (asserts! (not (default-to false (map-get? minters minter))) ERR-ALREADY-REGISTERED)
    (map-set minters minter true)
    (emit-event "minter-added" (concat "Minter added: " (principal-to-string minter)))
    (ok true)
  )
)

(define-public (remove-minter (minter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED)
    (map-set minters minter false)
    (emit-event "minter-removed" (concat "Minter removed: " (principal-to-string minter)))
    (ok true)
  )
)

(define-public (blacklist-user (user principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED)
    (map-set blacklisted user true)
    (emit-event "user-blacklisted" (concat "User blacklisted: " (principal-to-string user)))
    (ok true)
  )
)

(define-public (unblacklist-user (user principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED)
    (map-set blacklisted user false)
    (emit-event "user-unblacklisted" (concat "User unblacklisted: " (principal-to-string user)))
    (ok true)
  )
)

;; Mint function with metadata
(define-public (mint (amount uint) (recipient principal) (metadata (string-utf8 500)))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (default-to false (map-get? minters tx-sender)) ERR-INVALID-MINTER)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) ERR-INVALID-RECIPIENT) ;; Example invalid
    (asserts! (<= (len metadata) MAX-METADATA-LEN) ERR-METADATA-TOO-LONG)
    (asserts! (not (default-to false (map-get? blacklisted recipient))) ERR-BLACKLISTED)
    (try! (ft-mint? learn-token amount recipient))
    (var-set total-supply (+ (var-get total-supply) amount))
    (let ((id (+ (var-get mint-counter) u1)))
      (map-set mint-records id { minter: tx-sender, recipient: recipient, amount: amount, metadata: metadata, timestamp: (block-height) })
      (var-set mint-counter id)
      (emit-event "mint" (concat "Minted " (uint-to-string amount) " to " (principal-to-string recipient)))
      (ok id)
    )
  )
)

;; Transfer functions (SIP-10)
(define-public (transfer (amount uint) (sender principal) (recipient principal))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (not (default-to false (map-get? blacklisted recipient))) ERR-BLACKLISTED)
    (asserts! (>= (ft-get-balance learn-token sender) amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-transfer? learn-token amount sender recipient))
    (emit-event "transfer" (concat "Transferred " (uint-to-string amount) " from " (principal-to-string sender) " to " (principal-to-string recipient)))
    (ok true)
  )
)

(define-public (transfer-from (amount uint) (owner principal) (recipient principal))
  (let ((allowance-key { owner: owner, spender: tx-sender })
        (current-allowance (default-to u0 (map-get? allowances allowance-key))))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (not (default-to false (map-get? blacklisted recipient))) ERR-BLACKLISTED)
    (asserts! (>= (ft-get-balance learn-token owner) amount) ERR-INSUFFICIENT-BALANCE)
    (asserts! (>= current-allowance amount) ERR-INSUFFICIENT-ALLOWANCE)
    (try! (ft-transfer? learn-token amount owner recipient))
    (map-set allowances allowance-key (- current-allowance amount))
    (emit-event "transfer-from" (concat "Transferred " (uint-to-string amount) " from " (principal-to-string owner) " to " (principal-to-string recipient) " by " (principal-to-string tx-sender)))
    (ok true)
  )
)

(define-public (approve (spender principal) (amount uint))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (not (is-eq spender tx-sender)) ERR-INVALID-SPENDER)
    (map-set allowances { owner: tx-sender, spender: spender } amount)
    (emit-event "approve" (concat "Approved " (uint-to-string amount) " for " (principal-to-string spender)))
    (ok true)
  )
)

(define-public (burn (amount uint))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (>= (ft-get-balance learn-token tx-sender) amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? learn-token amount tx-sender))
    (var-set total-supply (- (var-get total-supply) amount))
    (emit-event "burn" (concat "Burned " (uint-to-string amount) " by " (principal-to-string tx-sender)))
    (ok true)
  )
)

;; Read-only functions
(define-read-only (get-name)
  (ok TOKEN-NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance learn-token account))
)

(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances { owner: owner, spender: spender })))
)

(define-read-only (get-mint-record (id uint))
  (map-get? mint-records id)
)

(define-read-only (is-minter (account principal))
  (default-to false (map-get? minters account))
)

(define-read-only (is-paused)
  (var-get contract-paused)
)

(define-read-only (is-blacklisted (account principal))
  (default-to false (map-get? blacklisted account))
)

(define-read-only (get-admin)
  (var-get contract-admin)
)

;; Helper functions (private)
(define-private (principal-to-string (p principal))
  (unwrap-panic (to-string p))
)

(define-private (uint-to-string (n uint))
  (unwrap-panic (to-string n))
)

;; Initial setup
(map-set minters INITIAL-ADMIN true) ;; Admin is initial minter