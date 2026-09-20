import type { SavedPlace } from "../../domain/place";
import type { GeoPlace } from "../../services/geoProvider";
import { Modal } from "../ui/Modal";
import { PlaceEditor } from "./PlaceEditor";
import { Attributions } from "./Attributions";
export function SavePlaceModal({
  place,
  onClose,
  onSaved,
}: {
  place: GeoPlace;
  onClose: () => void;
  onSaved: (place: SavedPlace) => void;
}) {
  return (
    <Modal title="Lưu địa điểm" onClose={onClose}>
      <p>{place.name}</p>
      <p>{place.address}</p>
      <Attributions />
      <PlaceEditor source="geoapify" providerPlace={place} onSaved={onSaved} />
    </Modal>
  );
}
