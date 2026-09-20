use harmonia_lib::recognition::validate_pcm;

#[test]
fn native_pcm_contract_rejects_empty_unaligned_nonfinite_and_oversized_input() {
    assert!(validate_pcm(&[]).is_err());
    assert!(validate_pcm(&[0, 0, 0]).is_err());
    assert!(validate_pcm(&f32::NAN.to_le_bytes()).is_err());
    assert!(validate_pcm(&f32::INFINITY.to_le_bytes()).is_err());
    assert_eq!(validate_pcm(&0.25f32.to_le_bytes()).unwrap(), 1);
    assert!(validate_pcm(&vec![0; 22050 * 1200 * 4 + 4]).is_err());
}
