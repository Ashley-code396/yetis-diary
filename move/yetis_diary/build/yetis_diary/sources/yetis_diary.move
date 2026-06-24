module yetis_diary::yetis_diary;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};

const MAX_ENTRY_LENGTH: u64 = 280;
const COOLDOWN_MS: u64 = 86_400_000;
const CONTENT_HASH_LENGTH: u64 = 32;

#[error]
const ENotRegistered: vector<u8> = b"Wallet has not registered as a writer";
#[error]
const ENotYourTurn: vector<u8> = b"It is not this wallet's turn to write";
#[error]
const ETooSoon: vector<u8> = b"Cooldown has not elapsed since the last entry";
#[error]
const EEntryTooLong: vector<u8> = b"Entry exceeds the maximum character length";
#[error]
const EEmptyEntry: vector<u8> = b"Entry must not be empty";
#[error]
const EQueueEmpty: vector<u8> = b"No writers are registered in the queue";
#[error]
const EInvalidContentHash: vector<u8> = b"Content hash must be exactly 32 bytes";
#[error]
const EStaleBlobId: vector<u8> = b"New blob id must differ from the current blob id";

public struct YETIS_DIARY has drop {}

public struct SetupCap has key, store {
    id: UID,
}

public struct Diary has key {
    id: UID,
    entry_count: u64,
    last_writer: address,
    last_written_at: u64,
    current_blob_id: String,
    content_hash: vector<u8>,
    queue: vector<address>,
    turn_index: u64,
    registered: Table<address, bool>,
    last_written_at_by_wallet: Table<address, u64>,
}

public struct EntryAdded has copy, drop {
    entry_index: u64,
    author: address,
    blob_id: String,
    timestamp: u64,
}

fun init(otw: YETIS_DIARY, ctx: &mut TxContext) {
    let publisher = sui::package::claim(otw, ctx);
    transfer::public_transfer(
        SetupCap {
            id: object::new(ctx),
        },
        ctx.sender(),
    );
    transfer::public_transfer(publisher, ctx.sender());
}

public fun setup(
    cap: SetupCap,
    genesis_blob_id: String,
    genesis_content_hash: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(genesis_content_hash.length() == CONTENT_HASH_LENGTH, EInvalidContentHash);
    let SetupCap { id } = cap;
    id.delete();
    transfer::share_object(new_diary(genesis_blob_id, genesis_content_hash, ctx));
}

public fun register(diary: &mut Diary, ctx: &TxContext) {
    let sender = ctx.sender();
    if (table::contains(&diary.registered, sender)) {
        return
    };
    table::add(&mut diary.registered, sender, true);
    table::add(&mut diary.last_written_at_by_wallet, sender, 0);
    diary.queue.push_back(sender);
}

public fun write_entry(
    diary: &mut Diary,
    text: String,
    new_blob_id: String,
    new_content_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let sender = ctx.sender();
    assert!(table::contains(&diary.registered, sender), ENotRegistered);
    assert!(diary.queue.length() > 0, EQueueEmpty);
    assert!(sender == turn_holder(diary), ENotYourTurn);

    let last_written = *table::borrow(&diary.last_written_at_by_wallet, sender);
    if (last_written > 0) {
        assert!(clock.timestamp_ms() >= last_written + COOLDOWN_MS, ETooSoon);
    };

    let text_length = text.length();
    assert!(text_length > 0, EEmptyEntry);
    assert!(text_length <= MAX_ENTRY_LENGTH, EEntryTooLong);
    assert!(new_content_hash.length() == CONTENT_HASH_LENGTH, EInvalidContentHash);
    assert!(new_blob_id != diary.current_blob_id, EStaleBlobId);

    let timestamp = clock.timestamp_ms();
    let recorded_at = if (timestamp == 0) { 1 } else { timestamp };
    let entry_index = diary.entry_count;

    diary.entry_count = entry_index + 1;
    diary.last_writer = sender;
    diary.last_written_at = recorded_at;
    diary.current_blob_id = new_blob_id;
    diary.content_hash = new_content_hash;
    diary.turn_index = diary.turn_index + 1;
    *table::borrow_mut(&mut diary.last_written_at_by_wallet, sender) = recorded_at;

    event::emit(EntryAdded {
        entry_index,
        author: sender,
        blob_id: diary.current_blob_id,
        timestamp: recorded_at,
    });
}

public fun turn_holder(diary: &Diary): address {
    assert!(diary.queue.length() > 0, EQueueEmpty);
    diary.queue[diary.turn_index % diary.queue.length()]
}

public fun queue_length(diary: &Diary): u64 {
    diary.queue.length()
}

public fun queue_position(diary: &Diary, addr: address): Option<u64> {
    let mut i = 0;
    let len = diary.queue.length();
    while (i < len) {
        if (diary.queue[i] == addr) {
            return option::some(i)
        };
        i = i + 1;
    };
    option::none()
}

public fun is_registered(diary: &Diary, addr: address): bool {
    table::contains(&diary.registered, addr)
}

public fun cooldown_remaining_ms(diary: &Diary, addr: address, clock: &Clock): u64 {
    if (!table::contains(&diary.last_written_at_by_wallet, addr)) {
        return 0
    };
    let last_written = *table::borrow(&diary.last_written_at_by_wallet, addr);
    if (last_written == 0) {
        return 0
    };
    let elapsed = clock.timestamp_ms();
    let unlock_at = last_written + COOLDOWN_MS;
    if (elapsed >= unlock_at) {
        0
    } else {
        unlock_at - elapsed
    }
}

public fun entry_count(diary: &Diary): u64 {
    diary.entry_count
}

public fun current_blob_id(diary: &Diary): &String {
    &diary.current_blob_id
}

public fun content_hash(diary: &Diary): &vector<u8> {
    &diary.content_hash
}

public fun turn_index(diary: &Diary): u64 {
    diary.turn_index
}

public fun max_entry_length(): u64 {
    MAX_ENTRY_LENGTH
}

public fun cooldown_ms(): u64 {
    COOLDOWN_MS
}

fun new_diary(genesis_blob_id: String, genesis_content_hash: vector<u8>, ctx: &mut TxContext): Diary {
    Diary {
        id: object::new(ctx),
        entry_count: 0,
        last_writer: @0x0,
        last_written_at: 0,
        current_blob_id: genesis_blob_id,
        content_hash: genesis_content_hash,
        queue: vector[],
        turn_index: 0,
        registered: table::new(ctx),
        last_written_at_by_wallet: table::new(ctx),
    }
}

#[test_only]
public fun create_diary_for_testing(
    genesis_blob_id: String,
    genesis_content_hash: vector<u8>,
    ctx: &mut TxContext,
): Diary {
    new_diary(genesis_blob_id, genesis_content_hash, ctx)
}

#[test_only]
public fun destroy_diary_for_testing(diary: Diary) {
    let Diary {
        id,
        entry_count: _,
        last_writer: _,
        last_written_at: _,
        current_blob_id: _,
        content_hash: _,
        queue: _,
        turn_index: _,
        registered,
        last_written_at_by_wallet,
    } = diary;
    id.delete();
    registered.drop();
    last_written_at_by_wallet.drop();
}
