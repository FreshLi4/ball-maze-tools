import unreal

# ============================================================
#  Config
# ============================================================

PARENT_MATERIAL_REFERENCE = "/Script/Engine.Material'/Game/Item/Mesh/Voxel/M_VoxelBasic.M_VoxelBasic'"
INSTANCE_PREFIX = "MI_"
SAVE_CREATED_ASSETS = True

# ============================================================
#  Core
# ============================================================

eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()


def get_asset_class_name(asset_data):
    class_path = getattr(asset_data, "asset_class_path", None)
    if class_path:
        return str(class_path.asset_name)
    return str(asset_data.asset_class)


def resolve_target_path():
    # Prefer the active Content Browser address. Fall back to selected folders,
    # then selected asset folder for older UE versions.
    if hasattr(unreal.EditorUtilityLibrary, "get_current_content_browser_path"):
        current_path = unreal.EditorUtilityLibrary.get_current_content_browser_path()
        if current_path:
            return str(current_path)

    selected_folders = unreal.EditorUtilityLibrary.get_selected_folder_paths()
    if selected_folders:
        return str(selected_folders[0])

    selected_asset_data = unreal.EditorUtilityLibrary.get_selected_asset_data()
    if selected_asset_data:
        return str(selected_asset_data[0].package_path)

    return "/Game"


def load_parent_material():
    parent = unreal.load_asset(PARENT_MATERIAL_REFERENCE)
    if not parent:
        unreal.log_error(f"[CreateMI] Parent material not found: {PARENT_MATERIAL_REFERENCE}")
        return None

    try:
        return unreal.Material.cast(parent)
    except TypeError:
        unreal.log_error(
            f"[CreateMI] Parent asset is {parent.get_class().get_name()}, not Material: {PARENT_MATERIAL_REFERENCE}"
        )
        return None


def get_selected_materials():
    selected = unreal.EditorUtilityLibrary.get_selected_asset_data()
    materials = []
    skipped = []

    for asset_data in selected:
        asset_name = str(asset_data.asset_name)
        class_name = get_asset_class_name(asset_data)

        if class_name != "Material":
            skipped.append((asset_name, class_name))
            continue

        asset = asset_data.get_asset()
        try:
            material = unreal.Material.cast(asset)
        except TypeError:
            skipped.append((asset_name, asset.get_class().get_name()))
            continue

        if material:
            materials.append((asset_name, material))

    return materials, skipped


def create_material_instance(target_path, asset_name, parent_material):
    instance_name = f"{INSTANCE_PREFIX}{asset_name}"
    instance_path = f"{target_path}/{instance_name}"

    if eal.does_asset_exist(instance_path):
        unreal.log_warning(f"[CreateMI] Skipped existing asset: {instance_path}")
        return None, "exists"

    factory = unreal.MaterialInstanceConstantFactoryNew()
    created = asset_tools.create_asset(
        asset_name=instance_name,
        package_path=target_path,
        asset_class=unreal.MaterialInstanceConstant,
        factory=factory,
    )

    if not created:
        unreal.log_error(f"[CreateMI] Failed to create: {instance_path}")
        return None, "failed"

    try:
        instance = unreal.MaterialInstanceConstant.cast(created)
    except TypeError:
        unreal.log_error(
            f"[CreateMI] Created asset is {created.get_class().get_name()}, not MaterialInstanceConstant: {instance_path}"
        )
        return None, "failed"

    mel.set_material_instance_parent(instance, parent_material)
    mel.update_material_instance(instance)

    if SAVE_CREATED_ASSETS:
        eal.save_asset(instance_path)

    unreal.log(f"[CreateMI] Created {instance_path}")
    return instance_path, "created"


def run():
    target_path = resolve_target_path()
    parent_material = load_parent_material()
    if not parent_material:
        return

    materials, skipped = get_selected_materials()

    unreal.log("=" * 60)
    unreal.log(f"[CreateMI] Target folder: {target_path}")
    unreal.log(f"[CreateMI] Parent: {PARENT_MATERIAL_REFERENCE}")
    unreal.log("=" * 60)

    if not materials:
        unreal.log_warning("[CreateMI] No selected Material assets found.")
        if skipped:
            unreal.log_warning("[CreateMI] Selected assets skipped:")
            for asset_name, class_name in skipped:
                unreal.log_warning(f"  - {asset_name} ({class_name})")
        return

    created_paths = []
    existing = 0
    failed = 0

    with unreal.ScopedSlowTask(len(materials), "Creating material instances...") as task:
        task.make_dialog(True)

        for asset_name, _material in materials:
            if task.should_cancel():
                break

            task.enter_progress_frame(1, asset_name)
            created_path, status = create_material_instance(target_path, asset_name, parent_material)

            if status == "created":
                created_paths.append(created_path)
            elif status == "exists":
                existing += 1
            else:
                failed += 1

    if skipped:
        unreal.log_warning("[CreateMI] Selected non-Material assets skipped:")
        for asset_name, class_name in skipped:
            unreal.log_warning(f"  - {asset_name} ({class_name})")

    unreal.log("=" * 60)
    unreal.log(
        f"[CreateMI] Done. Created: {len(created_paths)}  Existing skipped: {existing}  Failed: {failed}"
    )
    if created_paths:
        unreal.log("[CreateMI] Created assets:")
        for path in created_paths:
            unreal.log(f"  - {path}")
    unreal.log("=" * 60)


run()
