import unreal


# ============================================================
#  Config
# ============================================================

# Center-to-center distance between arranged actors, in Unreal units.
SPACING = 2.0

# World-space direction used for the arrangement. The script normalizes it.
DIRECTION = unreal.Vector(0.0, 1.0, 0.0)

# True = keep the current selected actors selected after moving them.
RESTORE_SELECTION = True

# True = print target positions without moving actors.
DRY_RUN = False


# ============================================================
#  Selection helpers
# ============================================================

def _get_selected_actors():
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "get_selected_level_actors"):
            return list(subsystem.get_selected_level_actors())

    return list(unreal.EditorLevelLibrary.get_selected_level_actors())


def _set_selected_actors(actors):
    if not RESTORE_SELECTION:
        return

    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "set_selected_level_actors"):
            subsystem.set_selected_level_actors(actors)
            return

    unreal.EditorLevelLibrary.set_selected_level_actors(actors)


def _actor_label(actor):
    if hasattr(actor, "get_actor_label"):
        return actor.get_actor_label()
    return actor.get_name()


def _get_static_mesh_component(actor):
    if hasattr(actor, "static_mesh_component"):
        component = actor.static_mesh_component
        if component:
            return component

    if hasattr(actor, "get_component_by_class"):
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        if component:
            return component

    return None


def _get_component_static_mesh(component):
    if not component:
        return None

    if hasattr(component, "get_static_mesh"):
        return component.get_static_mesh()

    try:
        return component.get_editor_property("static_mesh")
    except Exception:
        return None


def _selected_static_mesh_actors():
    selected = _get_selected_actors()
    valid = []
    skipped = []

    for index, actor in enumerate(selected):
        component = _get_static_mesh_component(actor)
        static_mesh = _get_component_static_mesh(component)
        if component and static_mesh:
            valid.append((index, actor))
        else:
            skipped.append((index, actor))

    return selected, valid, skipped


# ============================================================
#  Vector helpers
# ============================================================

def _vector(x, y, z):
    return unreal.Vector(float(x), float(y), float(z))


def _vector_size(vector):
    return (vector.x * vector.x + vector.y * vector.y + vector.z * vector.z) ** 0.5


def _normalized(vector):
    size = _vector_size(vector)
    if size <= 0.000001:
        raise RuntimeError("DIRECTION must not be a zero vector.")
    return _vector(vector.x / size, vector.y / size, vector.z / size)


def _add(left, right):
    return _vector(left.x + right.x, left.y + right.y, left.z + right.z)


def _scale(vector, scalar):
    return _vector(vector.x * scalar, vector.y * scalar, vector.z * scalar)


def _format_vector(vector):
    return f"({vector.x:.3f}, {vector.y:.3f}, {vector.z:.3f})"


# ============================================================
#  Core
# ============================================================

def _set_actor_location(actor, location):
    if DRY_RUN:
        return True

    try:
        if hasattr(actor, "modify"):
            actor.modify()
    except Exception:
        pass

    try:
        return bool(actor.set_actor_location(location, False, True))
    except TypeError:
        actor.set_actor_location(location, False)
        return True


def run():
    selected, valid, skipped = _selected_static_mesh_actors()

    unreal.log("=" * 60)
    unreal.log("[ArrangeStaticMesh] Arrange selected Static Mesh actors")
    unreal.log(f"[ArrangeStaticMesh] Selected actors: {len(selected)}")
    unreal.log(f"[ArrangeStaticMesh] Valid Static Mesh actors: {len(valid)}")
    unreal.log(f"[ArrangeStaticMesh] Spacing: {SPACING}")
    unreal.log(f"[ArrangeStaticMesh] Direction: {_format_vector(DIRECTION)}")
    unreal.log(f"[ArrangeStaticMesh] Dry run: {DRY_RUN}")
    unreal.log("=" * 60)

    if not valid:
        unreal.log_warning("[ArrangeStaticMesh] No selected Static Mesh actors found.")
        return

    if SPACING < 0:
        unreal.log_warning("[ArrangeStaticMesh] SPACING is negative; actors will be arranged opposite index order.")

    direction = _normalized(DIRECTION)
    anchor_actor = valid[0][1]
    anchor_location = anchor_actor.get_actor_location()

    if skipped:
        unreal.log_warning("[ArrangeStaticMesh] Selected non-Static Mesh actors skipped:")
        for index, actor in skipped:
            unreal.log_warning(f"  - selection #{index}: {_actor_label(actor)}")

    moved = 0
    failed = 0

    transaction = unreal.ScopedEditorTransaction("Arrange Selected Static Mesh Actors")
    try:
        for arranged_index, (_selection_index, actor) in enumerate(valid):
            target_location = _add(anchor_location, _scale(direction, SPACING * arranged_index))
            label = _actor_label(actor)

            if _set_actor_location(actor, target_location):
                moved += 1
                unreal.log(
                    f"[ArrangeStaticMesh] #{arranged_index}: {label} -> {_format_vector(target_location)}"
                )
            else:
                failed += 1
                unreal.log_error(
                    f"[ArrangeStaticMesh] Failed to move #{arranged_index}: {label}"
                )
    finally:
        del transaction

    _set_selected_actors(selected)

    unreal.log("=" * 60)
    unreal.log(
        f"[ArrangeStaticMesh] Done. Arranged: {moved}  Failed: {failed}  Skipped: {len(skipped)}"
    )
    unreal.log(f"[ArrangeStaticMesh] Anchor: {_actor_label(anchor_actor)} at {_format_vector(anchor_location)}")
    unreal.log("=" * 60)


run()
