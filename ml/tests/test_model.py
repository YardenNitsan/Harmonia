import torch

from harmonia_ml.models.structured import StructuredChordModel, multitask_loss


def test_structured_model_emits_frame_aligned_component_heads() -> None:
    model = StructuredChordModel(input_features=26, hidden_channels=32, blocks=2, dropout=0.0)
    inputs = torch.zeros(2, 17, 26)

    outputs = model(inputs)

    assert outputs["root"].shape == (2, 17, 13)
    assert outputs["triad"].shape == (2, 17, 8)
    assert outputs["seventh"].shape == (2, 17, 4)
    assert outputs["bass"].shape == (2, 17, 13)
    assert outputs["extensions"].shape == (2, 17, 4)
    assert outputs["boundary"].shape == (2, 17)


def test_multitask_loss_ignores_padding_frames() -> None:
    model = StructuredChordModel(input_features=26, hidden_channels=16, blocks=1, dropout=0.0)
    outputs = model(torch.zeros(1, 4, 26))
    targets = {
        "root": torch.tensor([[0, 0, 0, 12]]),
        "triad": torch.tensor([[1, 1, 1, 0]]),
        "seventh": torch.tensor([[0, 0, 0, 0]]),
        "bass": torch.tensor([[0, 0, 0, 12]]),
        "extensions": torch.zeros(1, 4, 4),
        "boundary": torch.zeros(1, 4),
        "mask": torch.tensor([[True, True, True, False]]),
    }

    first = multitask_loss(outputs, targets)
    targets["root"][0, 3] = 6
    second = multitask_loss(outputs, targets)

    assert torch.equal(first, second)
