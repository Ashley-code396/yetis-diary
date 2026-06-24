module yetis_diary::yetis_diary_tests;

use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::test_scenario::{Self as ts, Scenario};
use yetis_diary::yetis_diary::{Self, Diary};

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const GENESIS_BLOB_ID: vector<u8> = b"genesis-blob-id";

fun genesis_hash(): vector<u8> {
    x"0101010101010101010101010101010101010101010101010101010101010101"
}

fun next_hash(): vector<u8> {
    x"0202020202020202020202020202020202020202020202020202020202020202"
}

fun third_hash(): vector<u8> {
    x"0303030303030303030303030303030303030303030303030303030303030303"
}

fun short_text(): vector<u8> {
    b"The yeti opened the diary."
}

fun long_text(): vector<u8> {
    let mut text = vector[];
    let mut i = 0u64;
    while (i < 281) {
        text.push_back(97);
        i = i + 1;
    };
    text
}

fun begin_diary(scenario: &mut Scenario): (Diary, Clock) {
    ts::next_tx(scenario, @0x0);
    let diary = yetis_diary::create_diary_for_testing(
        GENESIS_BLOB_ID.to_string(),
        genesis_hash(),
        ts::ctx(scenario),
    );
    let clock = clock::create_for_testing(ts::ctx(scenario));
    (diary, clock)
}

fun end_diary(diary: Diary, clock: Clock) {
    clock::destroy_for_testing(clock);
    yetis_diary::destroy_diary_for_testing(diary);
}

#[test]
fun registered_wallet_can_write() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"next-blob-id".to_string(),
        next_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );
    assert_eq!(yetis_diary::entry_count(&diary), 1);
    assert_eq!(yetis_diary::turn_index(&diary), 1);

    end_diary(diary, clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = yetis_diary::ENotRegistered)]
fun unregistered_wallet_is_rejected() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"next-blob-id".to_string(),
        next_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    end_diary(diary, clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = yetis_diary::ENotYourTurn)]
fun wrong_turn_wallet_is_rejected() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, BOB);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, BOB);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"next-blob-id".to_string(),
        next_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    end_diary(diary, clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = yetis_diary::EEntryTooLong)]
fun overlength_entry_is_rejected() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        long_text().to_string(),
        b"next-blob-id".to_string(),
        next_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    end_diary(diary, clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = yetis_diary::ETooSoon)]
fun turn_advances_after_write() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"next-blob-id".to_string(),
        next_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );
    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"third-blob-id".to_string(),
        third_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    end_diary(diary, clock);
    ts::end(scenario);
}

#[test, expected_failure(abort_code = yetis_diary::ETooSoon)]
fun cooldown_is_enforced_after_write() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, BOB);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"next-blob-id".to_string(),
        next_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    ts::next_tx(&mut scenario, BOB);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"third-blob-id".to_string(),
        third_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"fourth-blob-id".to_string(),
        x"0404040404040404040404040404040404040404040404040404040404040404",
        &clock,
        ts::ctx(&mut scenario),
    );

    end_diary(diary, clock);
    ts::end(scenario);
}

#[test]
fun cooldown_allows_write_after_elapsed_time() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, mut clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"next-blob-id".to_string(),
        next_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    clock::increment_for_testing(&mut clock, yetis_diary::cooldown_ms() + 1);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::write_entry(
        &mut diary,
        short_text().to_string(),
        b"third-blob-id".to_string(),
        third_hash(),
        &clock,
        ts::ctx(&mut scenario),
    );

    assert_eq!(yetis_diary::entry_count(&diary), 2);

    end_diary(diary, clock);
    ts::end(scenario);
}

#[test]
fun register_is_idempotent() {
    let mut scenario = ts::begin(ALICE);
    let (mut diary, clock) = begin_diary(&mut scenario);

    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    ts::next_tx(&mut scenario, ALICE);
    yetis_diary::register(&mut diary, ts::ctx(&mut scenario));
    assert_eq!(yetis_diary::queue_length(&diary), 1);

    end_diary(diary, clock);
    ts::end(scenario);
}
