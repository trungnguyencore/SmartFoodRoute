import type { SavedPlace } from "../../domain/place";
import { Modal } from "../ui/Modal";
import { PlaceEditor } from "./PlaceEditor";
export function SaveCustomPlaceModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (place: SavedPlace) => void;
}) {
  return (
    <Modal title="Thêm địa điểm riêng" onClose={onClose}>
      <PlaceEditor source="custom" onSaved={onSaved} />
    </Modal>
  );
}
