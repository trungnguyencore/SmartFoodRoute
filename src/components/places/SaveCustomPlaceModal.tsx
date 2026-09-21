import type { SavedPlace } from "../../domain/place";
import { Modal } from "../ui/Modal";
import { PlaceEditor } from "./PlaceEditor";
import {
  clearCustomPlaceDraft,
  hasCustomPlaceDraft,
} from "../../utils/customPlaceDraft";
export function SaveCustomPlaceModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (place: SavedPlace) => void;
}) {
  const requestClose = () => {
    if (
      hasCustomPlaceDraft() &&
      !window.confirm("Bỏ bản nháp địa điểm đang nhập?")
    )
      return;
    clearCustomPlaceDraft();
    onClose();
  };
  return (
    <Modal title="Thêm địa điểm riêng" onClose={requestClose}>
      <PlaceEditor source="custom" onSaved={onSaved} />
    </Modal>
  );
}
