;; CertificateNFT.clar
;; Sophisticated NFT for completion certificates in LearnEarn, with admin controls, metadata, transfer,
;; burning, upgrades (versions), categories, collaborators, and status updates.
;; Follows SIP-09 standard with extensions for educational certifications.

(define-constant ERR-NOT-AUTHORIZED (err u200))
(define-constant ERR-INVALID-ID (err u201))
(define-constant ERR-ALREADY-EXISTS (err u202))
(define-constant ERR-NOT-OWNER (err u203))
(define-constant ERR-PAUSED (err u204))
(define-constant ERR-METADATA-TOO-LONG (err u205))
(define-constant ERR-INVALID-COLLABORATOR (err u206))

(define-constant MAX-METADATA-LEN u500)
(define-constant INITIAL-ADMIN tx-sender)

(define-non-fungible-token certificate-nft uint)

(define-data-var contract-paused bool false)
(define-data-var contract-admin principal INITIAL-ADMIN)
(define-data-var last-nft-id uint u0)

(define-map nft-metadata uint { module-id: uint, user: principal, completion-date: uint, title: (string-utf8 100), description: (string-utf8 500) })
(define-map nft-owners uint principal)
(define-map nft-versions { nft-id: uint, version: uint } { updated-metadata: (string-utf8 200), timestamp: uint })
(define-map nft-categories uint { category: (string-utf8 50), tags: (list 10 (string-utf8 20)) })
(define-map nft-collaborators { nft-id: uint, collaborator: principal } { role: (string-utf8 50), permissions: (list 5 (string-utf8 20)), added-at: uint })
(define-map nft-status uint { status: (string-utf8 20), visibility: bool, last-updated: uint })

;; Events (emulated)
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

;; Mint NFT
(define-public (mint (module-id uint) (recipient principal) (title (string-utf8 100)) (description (string-utf8 500)))
  (let ((new-id (+ (var-get last-nft-id) u1)))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR-NOT-AUTHORIZED) ;; Admin mints
    (asserts! (<= (len description) MAX-METADATA-LEN) ERR-METADATA-TOO-LONG)
    (try! (nft-mint? certificate-nft new-id recipient))
    (map-set nft-owners new-id recipient)
    (map-set nft-metadata new-id { module-id: module-id, user: recipient, completion-date: (block-height), title: title, description: description })
    (var-set last-nft-id new-id)
    (emit-event "nft-minted" (concat "Minted NFT " (uint-to-string new-id) " to " (principal-to-string recipient)))
    (ok new-id)
  )
)

;; Transfer NFT
(define-public (transfer (nft-id uint) (new-owner principal))
  (let ((current-owner (unwrap! (map-get? nft-owners nft-id) ERR-INVALID-ID)))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender current-owner) ERR-NOT-OWNER)
    (try! (nft-transfer? certificate-nft nft-id current-owner new-owner))
    (map-set nft-owners nft-id new-owner)
    (emit-event "nft-transferred" (concat "Transferred NFT " (uint-to-string nft-id) " to " (principal-to-string new-owner)))
    (ok true)
  )
)

;; Burn NFT
(define-public (burn (nft-id uint))
  (let ((owner (unwrap! (map-get? nft-owners nft-id) ERR-INVALID-ID)))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (try! (nft-burn? certificate-nft nft-id owner))
    (map-delete nft-owners nft-id)
    (map-delete nft-metadata nft-id)
    (emit-event "nft-burned" (concat "Burned NFT " (uint-to-string nft-id)))
    (ok true)
  )
)

;; Update version
(define-public (register-new-version (nft-id uint) (version uint) (updated-metadata (string-utf8 200)))
  (let ((owner (unwrap! (map-get? nft-owners nft-id) ERR-INVALID-ID)))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (is-none (map-get? nft-versions { nft-id: nft-id, version: version })) ERR-ALREADY-EXISTS)
    (map-set nft-versions { nft-id: nft-id, version: version } { updated-metadata: updated-metadata, timestamp: (block-height) })
    (emit-event "version-registered" (concat "New version " (uint-to-string version) " for NFT " (uint-to-string nft-id)))
    (ok true)
  )
)

;; Add category
(define-public (add-category (nft-id uint) (category (string-utf8 50)) (tags (list 10 (string-utf8 20))))
  (let ((owner (unwrap! (map-get? nft-owners nft-id) ERR-INVALID-ID)))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (map-set nft-categories nft-id { category: category, tags: tags })
    (emit-event "category-added" (concat "Category added to NFT " (uint-to-string nft-id)))
    (ok true)
  )
)

;; Add collaborator
(define-public (add-collaborator (nft-id uint) (collaborator principal) (role (string-utf8 50)) (permissions (list 5 (string-utf8 20))))
  (let ((owner (unwrap! (map-get? nft-owners nft-id) ERR-INVALID-ID)))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (asserts! (not (is-eq collaborator owner)) ERR-INVALID-COLLABORATOR)
    (map-set nft-collaborators { nft-id: nft-id, collaborator: collaborator } { role: role, permissions: permissions, added-at: (block-height) })
    (emit-event "collaborator-added" (concat "Collaborator added to NFT " (uint-to-string nft-id)))
    (ok true)
  )
)

;; Update status
(define-public (update-status (nft-id uint) (status (string-utf8 20)) (visibility bool))
  (let ((owner (unwrap! (map-get? nft-owners nft-id) ERR-INVALID-ID)))
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (map-set nft-status nft-id { status: status, visibility: visibility, last-updated: (block-height) })
    (emit-event "status-updated" (concat "Status updated for NFT " (uint-to-string nft-id)))
    (ok true)
  )
)

;; Read-only functions
(define-read-only (get-metadata (nft-id uint))
  (map-get? nft-metadata nft-id)
)

(define-read-only (get-owner (nft-id uint))
  (map-get? nft-owners nft-id)
)

(define-read-only (get-version (nft-id uint) (version uint))
  (map-get? nft-versions { nft-id: nft-id, version: version })
)

(define-read-only (get-category (nft-id uint))
  (map-get? nft-categories nft-id)
)

(define-read-only (get-collaborator (nft-id uint) (collaborator principal))
  (map-get? nft-collaborators { nft-id: nft-id, collaborator: collaborator })
)

(define-read-only (get-status (nft-id uint))
  (map-get? nft-status nft-id)
)

(define-read-only (is-paused)
  (var-get contract-paused)
)

(define-read-only (get-admin)
  (var-get contract-admin)
)

;; Helper functions
(define-private (principal-to-string (p principal))
  (unwrap-panic (to-string p))
)

(define-private (uint-to-string (n uint))
  (unwrap-panic (to-string n))
)