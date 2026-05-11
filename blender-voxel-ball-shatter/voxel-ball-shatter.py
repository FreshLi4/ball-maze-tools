# Combined Blender voxel shatter script.
# Base: conversation rewrite that snaps voxel positions and preserves UVs.
# Added: Color Attribute / vertex color transfer for material nodes.

import bpy
import math
import random
from collections import defaultdict
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon

# ============================================================
# 运行模式
# ============================================================

# 0 = merge：按 MERGE_LEVEL 合并体素块。
# 1 = random：在随机尺寸范围内合并体素块。
# 2 = separate：直接按原始 mesh 面分区；空壳和已有内部贴图会按原样保留。
SHATTER_MODE = 2

# ============================================================
# merge 模式参数：合并等级。
# ============================================================

# 1 = 当前行为，每个体素都是 1x1x1 小块。
# 2 = 目标尺寸 2x2x2，目标体积 8。
# 3 = 目标尺寸 3x3x3，目标体积 27。
# 4、5... 以此类推。
# 如果局部空间无法合并到目标大小，会自动降级到更小块，直到 1x1x1。
MERGE_LEVEL = 1

# ============================================================
# random 模式参数
# ============================================================

# 脚本会在 RANDOM_MERGE_LEVEL_MIN 到 RANDOM_MERGE_LEVEL_MAX 对应的尺寸范围内逐块随机选择块大小。
# 这不是最终块数上限；最终数量由模型形状和可合并空间自然决定。
RANDOM_MERGE_LEVEL_MIN = 3
RANDOM_MERGE_LEVEL_MAX = 5
RANDOM_SEED = 12345

# ============================================================
# separate 模式参数：目标块数。
# ============================================================

# 脚本会把目标数量分解成尽量接近正方体的三维网格。
# 例如 2 -> 2x1x1，4 -> 2x2x1，6 -> 3x2x1，
# 8 -> 2x2x2，9 -> 3x3x1，64 -> 4x4x4。
# 奇数会先按奇数 + 1 分区，再随机合并一对相邻分区。
SEPARATE_TARGET_BLOCKS = 64
SEPARATE_RANDOM_SEED = 12345

# ============================================================
# 基础参数
# ============================================================

# 你的单个体素块尺寸
VOXEL_SIZE = 0.1

# 网格边界吸附精度。
# 对 0.1 体素，一般用 0.05。
# 如果你的资产确实存在 0.0125 的整体偏移，可以改成 0.0125。
GRID_SNAP_STEP = 0.05

# 是否先用扫描线补成完整体积，再筛最外层。
# 对你的 2.5 x 2.5 x 2.5 体素球体，建议 True。
FILL_VOLUME_BY_SCANLINE = True

# 扫描线方向：
# 0 = X 轴扫描
# 1 = Y 轴扫描
# 2 = Z 轴扫描
SCANLINE_AXIS = 0

# 外层判断方向：
# "SIX" = 上下前后左右，标准外壳判断。
# "FIVE_NO_BOTTOM" = 上、前、后、左、右，不检查下方。
# 你描述里少了“下”，但对球体通常应该用 SIX。
OUTER_DIRECTIONS_MODE = "SIX"

# 使用应用修改器后的结果
USE_EVALUATED_MESH = True

# 如果同名 collection 已存在，是否删除重建
REPLACE_EXISTING_COLLECTION = True

# 如果对象同时属于多个 collection：
# False = 只挂到第一个原始 collection 下面
# True = 挂到所有原始 collection 下面
LINK_TO_ALL_SOURCE_COLLECTIONS = False

# 防止误生成过多对象
MAX_OUTPUT_CUBES_PER_OBJECT = 100000

# 位置/矩阵数值保留精度，避免 Blender 面板里出现长尾小数
POSITION_DECIMALS = 6

# 只接受接近轴向的面。体素模型一般都是 1.0。
AXIS_NORMAL_THRESHOLD = 0.9

# 容差
EPSILON = 1e-6

# ============================================================
# 基础工具
# ============================================================

def round_f(v, decimals=POSITION_DECIMALS):
    return round(float(v), decimals)

def snap_value(v, step):
    if step is None or step <= 0:
        return v
    return round(v / step) * step

def round_vector(v):
    return Vector((round_f(v.x), round_f(v.y), round_f(v.z)))

def rounded_matrix(m):
    result = m.copy()
    for r in range(4):
        for c in range(4):
            result[r][c] = round_f(result[r][c])
    return result

def get_bounds(mesh):
    coords = [v.co for v in mesh.vertices]

    min_co = Vector((
        min(v.x for v in coords),
        min(v.y for v in coords),
        min(v.z for v in coords),
    ))

    max_co = Vector((
        max(v.x for v in coords),
        max(v.y for v in coords),
        max(v.z for v in coords),
    ))

    return min_co, max_co

def dir_tuple(axis, sign):
    d = [0, 0, 0]
    d[axis] = 1 if sign >= 0 else -1
    return tuple(d)

def add_key(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])

def get_outer_dirs():
    if OUTER_DIRECTIONS_MODE == "FIVE_NO_BOTTOM":
        return [
            (1, 0, 0),
            (-1, 0, 0),
            (0, 1, 0),
            (0, -1, 0),
            (0, 0, 1),
        ]

    return [
        (1, 0, 0),
        (-1, 0, 0),
        (0, 1, 0),
        (0, -1, 0),
        (0, 0, 1),
        (0, 0, -1),
    ]

# ============================================================
# Collection 处理
# ============================================================

def unlink_collection_everywhere(col):
    scene_root = bpy.context.scene.collection

    if scene_root.children.get(col.name) == col:
        scene_root.children.unlink(col)

    for parent in bpy.data.collections:
        if parent.children.get(col.name) == col:
            parent.children.unlink(col)

def remove_collection_recursive(col):
    for child in list(col.children):
        remove_collection_recursive(child)

    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    unlink_collection_everywhere(col)

    if col.name in bpy.data.collections:
        bpy.data.collections.remove(col)

def unique_collection_name(base_name):
    if base_name not in bpy.data.collections:
        return base_name

    i = 1
    while f"{base_name}.{i:03d}" in bpy.data.collections:
        i += 1

    return f"{base_name}.{i:03d}"

def create_output_collection_for_object(obj):
    base_name = f"{obj.name}_shattered"

    existing = bpy.data.collections.get(base_name)

    if existing and REPLACE_EXISTING_COLLECTION:
        remove_collection_recursive(existing)

    col_name = base_name if REPLACE_EXISTING_COLLECTION else unique_collection_name(base_name)
    new_col = bpy.data.collections.new(col_name)

    source_collections = list(obj.users_collection)

    if not source_collections:
        bpy.context.scene.collection.children.link(new_col)
        return new_col

    if LINK_TO_ALL_SOURCE_COLLECTIONS:
        for parent_col in source_collections:
            parent_col.children.link(new_col)
    else:
        source_collections[0].children.link(new_col)

    return new_col

# ============================================================
# 网格坐标系统
# ============================================================

class VoxelGrid:
    def __init__(self, mesh):
        self.size = VOXEL_SIZE
        self.half = VOXEL_SIZE * 0.5

        min_co, max_co = get_bounds(mesh)

        # 用模型最小边界作为体素边界，再 + half 得到第一个体素中心。
        # 这里会吸附到 0.05 或 0.0125 之类的标准步长，避免浮点误差。
        self.min_boundary = Vector((
            round_f(snap_value(min_co.x, GRID_SNAP_STEP)),
            round_f(snap_value(min_co.y, GRID_SNAP_STEP)),
            round_f(snap_value(min_co.z, GRID_SNAP_STEP)),
        ))

        self.origin_center = Vector((
            round_f(self.min_boundary.x + self.half),
            round_f(self.min_boundary.y + self.half),
            round_f(self.min_boundary.z + self.half),
        ))

    def key_axis(self, value, axis):
        return int(round((value - self.origin_center[axis]) / self.size))

    def center_axis(self, key_value, axis):
        return round_f(self.origin_center[axis] + key_value * self.size)

    def key_from_center(self, center):
        return (
            self.key_axis(center.x, 0),
            self.key_axis(center.y, 1),
            self.key_axis(center.z, 2),
        )

    def center_from_key(self, key):
        return Vector((
            self.center_axis(key[0], 0),
            self.center_axis(key[1], 1),
            self.center_axis(key[2], 2),
        ))

# ============================================================
# UV / 材质记录
# ============================================================

def barycentric_2d(p, a, b, c):
    v0 = b - a
    v1 = c - a
    v2 = p - a

    denom = v0.x * v1.y - v1.x * v0.y

    if abs(denom) < EPSILON:
        return None

    v = (v2.x * v1.y - v1.x * v2.y) / denom
    w = (v0.x * v2.y - v2.x * v0.y) / denom
    u = 1.0 - v - w

    return u, v, w

def rgba_tuple(c):
    return (float(c[0]), float(c[1]), float(c[2]), float(c[3]))

def mix_rgba(c0, c1, c2, u, v, w):
    return (
        c0[0] * u + c1[0] * v + c2[0] * w,
        c0[1] * u + c1[1] * v + c2[1] * w,
        c0[2] * u + c1[2] * v + c2[2] * w,
        c0[3] * u + c1[3] * v + c2[3] * w,
    )

class FaceRecord:
    def __init__(self, mesh, poly, axis, sign):
        self.poly_index = poly.index
        self.material_index = poly.material_index
        self.axis = axis
        self.sign = sign
        self.face_dir = dir_tuple(axis, sign)

        self.tangent_axes = [0, 1, 2]
        self.tangent_axes.remove(axis)

        self.coords3d = [mesh.vertices[i].co.copy() for i in poly.vertices]
        self.coords2d = [
            Vector((co[self.tangent_axes[0]], co[self.tangent_axes[1]]))
            for co in self.coords3d
        ]

        self.uvs_by_layer = []

        for uv_layer in mesh.uv_layers:
            self.uvs_by_layer.append([
                uv_layer.data[loop_index].uv.copy()
                for loop_index in poly.loop_indices
            ])

        # 关键新增：记录原 mesh 上所有 Color Attribute
        # 你的材质节点 Color / Metallic / Roughness 等都依赖这里
        self.color_attrs_by_name = {}

        for attr in mesh.color_attributes:
            values = []

            if attr.domain == "CORNER":
                for loop_index in poly.loop_indices:
                    values.append(rgba_tuple(attr.data[loop_index].color))

            elif attr.domain == "POINT":
                for vertex_index in poly.vertices:
                    values.append(rgba_tuple(attr.data[vertex_index].color))

            elif attr.domain == "FACE":
                face_color = rgba_tuple(attr.data[poly.index].color)
                values = [face_color for _ in poly.vertices]

            else:
                continue

            self.color_attrs_by_name[attr.name] = values

        self.tris = self.make_tris()

    def make_tris(self):
        if len(self.coords2d) < 3:
            return []

        try:
            verts_for_tess = [
                Vector((p.x, p.y, 0.0))
                for p in self.coords2d
            ]
            tris = tessellate_polygon([verts_for_tess])
            return [tuple(tri) for tri in tris]
        except Exception:
            return [
                (0, i, i + 1)
                for i in range(1, len(self.coords2d) - 1)
            ]

    def contains_2d(self, p, tolerance=1e-5):
        for tri in self.tris:
            a = self.coords2d[tri[0]]
            b = self.coords2d[tri[1]]
            c = self.coords2d[tri[2]]

            bary = barycentric_2d(p, a, b, c)

            if bary is None:
                continue

            u, v, w = bary

            if u >= -tolerance and v >= -tolerance and w >= -tolerance:
                return True

        return False

    def uv_at(self, point3d, layer_index):
        if layer_index >= len(self.uvs_by_layer):
            return None

        p = Vector((
            point3d[self.tangent_axes[0]],
            point3d[self.tangent_axes[1]],
        ))

        for tri in self.tris:
            a = self.coords2d[tri[0]]
            b = self.coords2d[tri[1]]
            c = self.coords2d[tri[2]]

            bary = barycentric_2d(p, a, b, c)

            if bary is None:
                continue

            u, v, w = bary

            if u >= -1e-4 and v >= -1e-4 and w >= -1e-4:
                uv0 = self.uvs_by_layer[layer_index][tri[0]]
                uv1 = self.uvs_by_layer[layer_index][tri[1]]
                uv2 = self.uvs_by_layer[layer_index][tri[2]]

                return uv0 * u + uv1 * v + uv2 * w

        return self.average_uv(layer_index)

    def average_uv(self, layer_index):
        if layer_index >= len(self.uvs_by_layer):
            return Vector((0.0, 0.0))

        uvs = self.uvs_by_layer[layer_index]

        if not uvs:
            return Vector((0.0, 0.0))

        result = Vector((0.0, 0.0))

        for uv in uvs:
            result += uv

        result /= len(uvs)

        return result

    # 关键新增：根据原始面的位置插值 Color Attribute
    def color_attr_at(self, attr_name, point3d):
        values = self.color_attrs_by_name.get(attr_name)

        if not values:
            return None

        p = Vector((
            point3d[self.tangent_axes[0]],
            point3d[self.tangent_axes[1]],
        ))

        for tri in self.tris:
            a = self.coords2d[tri[0]]
            b = self.coords2d[tri[1]]
            c = self.coords2d[tri[2]]

            bary = barycentric_2d(p, a, b, c)

            if bary is None:
                continue

            u, v, w = bary

            if u >= -1e-4 and v >= -1e-4 and w >= -1e-4:
                c0 = values[tri[0]]
                c1 = values[tri[1]]
                c2 = values[tri[2]]
                return mix_rgba(c0, c1, c2, u, v, w)

        return self.average_color_attr(attr_name)

    def average_color_attr(self, attr_name):
        values = self.color_attrs_by_name.get(attr_name)

        if not values:
            return None

        n = len(values)

        return (
            sum(c[0] for c in values) / n,
            sum(c[1] for c in values) / n,
            sum(c[2] for c in values) / n,
            sum(c[3] for c in values) / n,
        )

def square_overlaps_face_record(record, center_a, center_b, half):
    min_a = center_a - half
    max_a = center_a + half
    min_b = center_b - half
    max_b = center_b + half

    square_center = Vector((center_a, center_b))

    if record.contains_2d(square_center):
        return True

    corners = [
        Vector((min_a, min_b)),
        Vector((max_a, min_b)),
        Vector((max_a, max_b)),
        Vector((min_a, max_b)),
    ]

    for c in corners:
        if record.contains_2d(c):
            return True

    for p in record.coords2d:
        if (
            min_a - EPSILON <= p.x <= max_a + EPSILON and
            min_b - EPSILON <= p.y <= max_b + EPSILON
        ):
            return True

    return False

def uv_from_records(records, point3d, layer_index):
    if not records:
        return Vector((0.0, 0.0))

    for record in records:
        uv = record.uv_at(point3d, layer_index)
        if uv is not None:
            return uv

    return records[0].average_uv(layer_index)

def color_attr_from_records(records, point3d, attr_name):
    if not records:
        return (1.0, 1.0, 1.0, 1.0)

    for record in records:
        color = record.color_attr_at(attr_name, point3d)
        if color is not None:
            return color

    return (1.0, 1.0, 1.0, 1.0)

# ============================================================
# 从原模型表面反推体素坐标
# ============================================================

def candidate_key_range_for_interval(grid, axis, min_value, max_value):
    half = grid.half
    size = grid.size

    start = ((min_value + half) - grid.origin_center[axis]) / size
    end = ((max_value - half) - grid.origin_center[axis]) / size

    k_min = math.ceil(start - 1e-5)
    k_max = math.floor(end + 1e-5)

    if k_max < k_min:
        mid = (min_value + max_value) * 0.5
        k = grid.key_axis(mid, axis)
        return range(k, k + 1)

    return range(k_min, k_max + 1)

def build_surface_occupancy_and_face_map(mesh, grid):
    occupancy = set()

    # key: ((ix, iy, iz), face_dir)
    # value: [FaceRecord, FaceRecord...]
    face_map = defaultdict(list)

    # key: (ix, iy, iz)
    # value: [FaceRecord, FaceRecord...]
    records_by_voxel = defaultdict(list)

    skipped_non_axis_faces = 0

    for poly in mesh.polygons:
        normal = poly.normal

        if normal.length < EPSILON:
            continue

        axis = max(range(3), key=lambda i: abs(normal[i]))

        if abs(normal[axis]) < AXIS_NORMAL_THRESHOLD:
            skipped_non_axis_faces += 1
            continue

        sign = 1 if normal[axis] >= 0 else -1
        face_dir = dir_tuple(axis, sign)

        record = FaceRecord(mesh, poly, axis, sign)

        face_coords = [mesh.vertices[i].co.copy() for i in poly.vertices]

        # 这个面所在的平面位置
        plane_value = sum(v[axis] for v in face_coords) / len(face_coords)

        # 外表面法线朝外，体素中心在法线反方向半个体素
        raw_center_axis = plane_value - sign * grid.half
        key_on_axis = grid.key_axis(raw_center_axis, axis)

        tangent_axes = record.tangent_axes
        ta = tangent_axes[0]
        tb = tangent_axes[1]

        min_a = min(v[ta] for v in face_coords)
        max_a = max(v[ta] for v in face_coords)
        min_b = min(v[tb] for v in face_coords)
        max_b = max(v[tb] for v in face_coords)

        range_a = candidate_key_range_for_interval(grid, ta, min_a, max_a)
        range_b = candidate_key_range_for_interval(grid, tb, min_b, max_b)

        for ka in range_a:
            for kb in range_b:
                key_list = [0, 0, 0]
                key_list[axis] = key_on_axis
                key_list[ta] = ka
                key_list[tb] = kb

                key = tuple(key_list)
                center = grid.center_from_key(key)

                if not square_overlaps_face_record(
                    record,
                    center[ta],
                    center[tb],
                    grid.half
                ):
                    continue

                occupancy.add(key)
                face_map[(key, face_dir)].append(record)
                records_by_voxel[key].append(record)

    if skipped_non_axis_faces > 0:
        print(f"Skipped {skipped_non_axis_faces} non-axis-aligned faces.")

    return occupancy, face_map, records_by_voxel

# ============================================================
# 扫描线填充 + 最外层过滤
# ============================================================

def fill_volume_by_scanline(surface_occupancy, axis):
    if not surface_occupancy:
        return set()

    other_axes = [0, 1, 2]
    other_axes.remove(axis)

    columns = defaultdict(list)

    for key in surface_occupancy:
        column_key = (key[other_axes[0]], key[other_axes[1]])
        columns[column_key].append(key[axis])

    filled = set(surface_occupancy)

    for column_key, values in columns.items():
        values = sorted(set(values))

        if len(values) < 2:
            continue

        start = values[0]
        end = values[-1]

        for k in range(start, end + 1):
            key_list = [0, 0, 0]
            key_list[axis] = k
            key_list[other_axes[0]] = column_key[0]
            key_list[other_axes[1]] = column_key[1]

            filled.add(tuple(key_list))

    return filled

def filter_outer_layer(occupancy):
    result = set()
    directions = get_outer_dirs()

    for key in occupancy:
        for d in directions:
            neighbor = add_key(key, d)

            if neighbor not in occupancy:
                result.add(key)
                break

    return result

# ============================================================
# 合并体素块
# ============================================================

def normalized_dims(dims):
    return tuple(int(max(1, d)) for d in dims)

def dims_volume(dims):
    return int(dims[0] * dims[1] * dims[2])

def dims_spread(dims):
    return max(dims) - min(dims)

def dims_is_cube(dims):
    return dims[0] == dims[1] == dims[2]

def dims_balance_score(dims):
    dx, dy, dz = normalized_dims(dims)
    return (dx - dy) ** 2 + (dy - dz) ** 2 + (dz - dx) ** 2

def target_side_from_level(level):
    return max(1, int(level))

def block_bounds(cells):
    xs = [key[0] for key in cells]
    ys = [key[1] for key in cells]
    zs = [key[2] for key in cells]

    min_key = (min(xs), min(ys), min(zs))
    max_key = (max(xs), max(ys), max(zs))
    dims = (
        max_key[0] - min_key[0] + 1,
        max_key[1] - min_key[1] + 1,
        max_key[2] - min_key[2] + 1,
    )

    return min_key, max_key, dims

def make_block_from_cells(cells, surface_keys, occupied_cells):
    cells = tuple(sorted(set(cells), key=lambda key: (key[2], key[1], key[0])))

    if not cells:
        return None

    if any(cell in occupied_cells for cell in cells):
        return None

    surface_in_block = tuple(cell for cell in cells if cell in surface_keys)

    if not surface_in_block:
        return None

    min_key, max_key, dims = block_bounds(cells)

    return {
        "min_key": min_key,
        "max_key": max_key,
        "dims": normalized_dims(dims),
        "cells": cells,
        "surface_keys": surface_in_block,
        "volume": len(cells),
        "surface_count": len(surface_in_block),
    }

def cells_for_box(min_key, dims):
    dx, dy, dz = normalized_dims(dims)

    for ix in range(dx):
        for iy in range(dy):
            for iz in range(dz):
                yield (
                    min_key[0] + ix,
                    min_key[1] + iy,
                    min_key[2] + iz,
                )

def candidate_min_keys_containing(seed_key, dims):
    dx, dy, dz = normalized_dims(dims)

    for ox in range(dx):
        for oy in range(dy):
            for oz in range(dz):
                yield (
                    seed_key[0] - ox,
                    seed_key[1] - oy,
                    seed_key[2] - oz,
                )

def cube_block(seed_key, target_side, allowed_cells, surface_keys, occupied_cells):
    dims = (target_side, target_side, target_side)
    best = None

    for min_key in candidate_min_keys_containing(seed_key, dims):
        cells = tuple(cells_for_box(min_key, dims))

        if all(cell in allowed_cells and cell not in occupied_cells for cell in cells):
            block = make_block_from_cells(cells, surface_keys, occupied_cells)

            if block is None:
                continue

            if best is None or block_sort_key(block) < block_sort_key(best):
                best = block

    return best

def neighbor_keys(key):
    return [add_key(key, d) for d in get_outer_dirs()]

def collect_arbitrary_block(seed_key, allowed_cells, surface_keys, occupied_cells, target_side, target_volume):
    if seed_key not in allowed_cells or seed_key in occupied_cells:
        return None

    block_cells = {seed_key}
    frontier = [seed_key]

    while frontier and len(block_cells) < target_volume:
        current = frontier.pop(0)
        neighbors = neighbor_keys(current)
        random.shuffle(neighbors)

        neighbors.sort(
            key=lambda key: (
                0 if key in surface_keys else 1,
                abs(key[0] - seed_key[0]) + abs(key[1] - seed_key[1]) + abs(key[2] - seed_key[2]),
            )
        )

        for neighbor in neighbors:
            if neighbor in block_cells:
                continue
            if neighbor not in allowed_cells or neighbor in occupied_cells:
                continue

            trial_cells = set(block_cells)
            trial_cells.add(neighbor)
            min_key, max_key, dims = block_bounds(trial_cells)

            if max(dims) > target_side:
                continue

            block_cells.add(neighbor)
            frontier.append(neighbor)

            if len(block_cells) >= target_volume:
                break

    if len(block_cells) <= 1 and target_volume > 1:
        return None

    return make_block_from_cells(block_cells, surface_keys, occupied_cells)

def block_sort_key(block):
    return (
        1 if block["volume"] == 1 else 0,
        0 if dims_is_cube(block["dims"]) and block["volume"] == dims_volume(block["dims"]) else 1,
        dims_balance_score(block["dims"]),
        -block["surface_count"],
        -block["volume"],
        max(block["dims"]),
        dims_spread(block["dims"]),
        block["min_key"],
    )

def try_priority_blocks(seed_key, target_side, full_occupancy, surface_keys, uncovered_surface, occupied_cells):
    target_side = target_side_from_level(target_side)
    target_volume = target_side ** 3
    surface_available = set(uncovered_surface) - occupied_cells
    full_available = set(full_occupancy) - occupied_cells

    # 1. 内+外表面体块，目标体积的正方体。
    block = cube_block(
        seed_key,
        target_side,
        full_available,
        uncovered_surface,
        occupied_cells,
    )
    if block is not None:
        return block

    # 2. 外表面体块，目标 size 的任意形状。
    block = collect_arbitrary_block(
        seed_key,
        surface_available,
        uncovered_surface,
        occupied_cells,
        target_side,
        target_volume,
    )
    if block is not None:
        return block

    # 3. 内+外表面体块，目标 size 的任意形状。
    block = collect_arbitrary_block(
        seed_key,
        full_available,
        uncovered_surface,
        occupied_cells,
        target_side,
        target_volume,
    )
    if block is not None:
        return block

    return None

def choose_target_side(randomize):
    if not randomize:
        return target_side_from_level(MERGE_LEVEL)

    min_level = target_side_from_level(RANDOM_MERGE_LEVEL_MIN)
    max_level = target_side_from_level(RANDOM_MERGE_LEVEL_MAX)

    if max_level < min_level:
        min_level, max_level = max_level, min_level

    return random.randint(min_level, max_level)

def merge_surface_voxels(full_occupancy, surface_keys, randomize=False):
    uncovered_surface = set(surface_keys)
    occupied_cells = set()
    blocks = []
    sorted_surface_keys = sorted(surface_keys, key=lambda k: (k[2], k[1], k[0]))
    seed_index = 0

    while uncovered_surface:
        seed_key = None

        while seed_index < len(sorted_surface_keys):
            possible_seed = sorted_surface_keys[seed_index]
            seed_index += 1

            if possible_seed in uncovered_surface:
                seed_key = possible_seed
                break

        if seed_key is None:
            break

        block = None
        target_side = choose_target_side(randomize)

        for side in range(target_side, 0, -1):
            block = try_priority_blocks(
                seed_key,
                side,
                full_occupancy,
                surface_keys,
                uncovered_surface,
                occupied_cells,
            )

            if block is not None:
                break

        if block is None:
            block = make_block_from_cells([seed_key], uncovered_surface, occupied_cells)

        if block is None:
            uncovered_surface.remove(seed_key)
            continue

        blocks.append(block)
        occupied_cells.update(block["cells"])
        uncovered_surface.difference_update(block["surface_keys"])

    return blocks

def build_merged_blocks(full_occupancy, surface_keys, randomize=False):
    if not randomize:
        blocks = merge_surface_voxels(full_occupancy, surface_keys, randomize=False)
        print(f"Merged blocks: {len(blocks)} at merge level {MERGE_LEVEL}")
        return blocks

    random.seed(RANDOM_SEED)
    blocks = merge_surface_voxels(full_occupancy, surface_keys, randomize=True)
    print(
        f"Random merged blocks: {len(blocks)} "
        f"with merge level range {RANDOM_MERGE_LEVEL_MIN}-{RANDOM_MERGE_LEVEL_MAX}"
    )
    return blocks

# ============================================================
# 生成 block mesh
# ============================================================

FACE_DEFS = [
    ((0, 0, -1), [(0, 1, 0), (0, 0, 0), (1, 0, 0), (1, 1, 0)]),
    ((0, 0, 1), [(0, 0, 1), (0, 1, 1), (1, 1, 1), (1, 0, 1)]),
    ((0, -1, 0), [(0, 0, 0), (0, 0, 1), (1, 0, 1), (1, 0, 0)]),
    ((0, 1, 0), [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)]),
    ((-1, 0, 0), [(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)]),
    ((1, 0, 0), [(1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0)]),
]

def block_center_from_cells(grid, block):
    min_key = block["min_key"]
    dims = block["dims"]
    min_center = grid.center_from_key(min_key)

    return Vector((
        round_f(min_center.x + (dims[0] - 1) * VOXEL_SIZE * 0.5),
        round_f(min_center.y + (dims[1] - 1) * VOXEL_SIZE * 0.5),
        round_f(min_center.z + (dims[2] - 1) * VOXEL_SIZE * 0.5),
    ))

def make_voxel_block_geometry(block):
    min_key = block["min_key"]
    dims = block["dims"]
    block_cells = set(block["cells"])
    verts = []
    vertex_by_coord = {}
    faces = []
    face_infos = []

    def add_vertex(coord):
        if coord in vertex_by_coord:
            return vertex_by_coord[coord]

        x, y, z = coord
        index = len(verts)
        vertex_by_coord[coord] = index
        verts.append((
            round_f((x - dims[0] * 0.5) * VOXEL_SIZE),
            round_f((y - dims[1] * 0.5) * VOXEL_SIZE),
            round_f((z - dims[2] * 0.5) * VOXEL_SIZE),
        ))
        return index

    def add_face(coords, cell_key, face_dir):
        faces.append([add_vertex(coord) for coord in coords])
        face_infos.append((cell_key, face_dir))

    for cell_key in block["cells"]:
        lx = cell_key[0] - min_key[0]
        ly = cell_key[1] - min_key[1]
        lz = cell_key[2] - min_key[2]

        for face_dir, offsets in FACE_DEFS:
            neighbor = add_key(cell_key, face_dir)

            if neighbor in block_cells:
                continue

            coords = [
                (lx + offset[0], ly + offset[1], lz + offset[2])
                for offset in offsets
            ]
            add_face(coords, cell_key, face_dir)

    return verts, faces, face_infos

def fallback_records_for_block(block, records_by_voxel):
    records = []

    for key in block["surface_keys"]:
        records.extend(records_by_voxel.get(key, []))

    if records:
        return records

    for key in block["cells"]:
        records.extend(records_by_voxel.get(key, []))

    return records

def make_voxel_block_mesh(
    name,
    source_mesh,
    center,
    block,
    face_map,
    records_by_voxel
):
    verts, faces, face_infos = make_voxel_block_geometry(block)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    # 复制材质槽
    for mat in source_mesh.materials:
        mesh.materials.append(mat)

    # 复制 UV Layer
    for src_uv_layer in source_mesh.uv_layers:
        mesh.uv_layers.new(name=src_uv_layer.name)

    # 关键新增：创建和原 mesh 同名的 Color Attributes
    # 注意：这里统一用 CORNER，避免一个 cube 顶点被多个面共用时颜色互相污染
    for src_attr in source_mesh.color_attributes:
        try:
            mesh.color_attributes.new(
                name=src_attr.name,
                type=src_attr.data_type,
                domain="CORNER"
            )
        except RuntimeError:
            pass

    block_fallback_records = fallback_records_for_block(block, records_by_voxel)

    for poly_index, poly in enumerate(mesh.polygons):
        cell_key, face_dir = face_infos[poly_index]

        exact_records = face_map.get((cell_key, face_dir), [])
        records = exact_records if exact_records else records_by_voxel.get(cell_key, [])
        records = records if records else block_fallback_records

        if records and len(mesh.materials) > 0:
            poly.material_index = min(records[0].material_index, len(mesh.materials) - 1)

        for loop_index in poly.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            local_vertex = Vector(verts[vertex_index])

            # 转回原 mesh 局部空间，用于采样原始 face 上的 UV / Color Attribute
            source_local_point = center + local_vertex

            # 写 UV
            for layer_index, uv_layer in enumerate(mesh.uv_layers):
                uv_layer.data[loop_index].uv = uv_from_records(
                    records,
                    source_local_point,
                    layer_index
                )

            # 写 Color Attributes
            for color_attr in mesh.color_attributes:
                color_attr.data[loop_index].color = color_attr_from_records(
                    records,
                    source_local_point,
                    color_attr.name
                )

    # 尽量把 active color attribute 也对齐到原 mesh
    try:
        if source_mesh.color_attributes.active_color:
            active_name = source_mesh.color_attributes.active_color.name
            for i, attr in enumerate(mesh.color_attributes):
                if attr.name == active_name:
                    mesh.color_attributes.active_color_index = i
                    break
    except Exception:
        pass

    try:
        if source_mesh.color_attributes.render_color_index >= 0:
            src_render_attr = source_mesh.color_attributes[
                source_mesh.color_attributes.render_color_index
            ]
            for i, attr in enumerate(mesh.color_attributes):
                if attr.name == src_render_attr.name:
                    mesh.color_attributes.render_color_index = i
                    break
    except Exception:
        pass

    mesh.update()
    return mesh

# ============================================================
# separate 模式：按原始面分块，不切新面
# ============================================================

def separate_base_count(target_count):
    target_count = max(1, int(target_count))

    if target_count % 2 == 1:
        return target_count + 1

    return target_count

def factor_triplets(n):
    n = max(1, int(n))

    for x in range(1, int(round(n ** (1.0 / 3.0))) + 3):
        if x <= 0 or n % x != 0:
            continue

        rem = n // x

        for y in range(x, int(math.sqrt(rem)) + 2):
            if rem % y != 0:
                continue

            z = rem // y

            if z < y:
                continue

            yield (z, y, x)

def separate_grid_shape(base_count, bounds_size):
    bounds = [
        max(float(bounds_size.x), EPSILON),
        max(float(bounds_size.y), EPSILON),
        max(float(bounds_size.z), EPSILON),
    ]
    axis_order = sorted(range(3), key=lambda axis: bounds[axis], reverse=True)
    best_shape = (base_count, 1, 1)
    best_score = None
    seen = set()

    for factors in factor_triplets(base_count):
        if factors in seen:
            continue
        seen.add(factors)

        shape = [1, 1, 1]

        for factor_index, axis in enumerate(axis_order):
            shape[axis] = factors[factor_index]

        cell_sizes = [
            bounds[axis] / shape[axis]
            for axis in range(3)
        ]
        largest_cell = max(cell_sizes)
        smallest_cell = max(min(cell_sizes), EPSILON)
        factor_spread = max(factors) / max(min(factors), 1)
        score = (
            largest_cell / smallest_cell,
            factor_spread,
            sum((size - sum(cell_sizes) / 3.0) ** 2 for size in cell_sizes),
            -min(factors),
            factors,
        )

        if best_score is None or score < best_score:
            best_score = score
            best_shape = tuple(shape)

    return best_shape

def polygon_center(mesh, poly):
    center = Vector((0.0, 0.0, 0.0))

    for vertex_index in poly.vertices:
        center += mesh.vertices[vertex_index].co

    if len(poly.vertices) > 0:
        center /= len(poly.vertices)

    return center

def separate_axis_index(value, min_value, max_value, parts):
    if parts <= 1 or abs(max_value - min_value) < EPSILON:
        return 0

    ratio = (value - min_value) / (max_value - min_value)
    index = int(ratio * parts)
    return min(parts - 1, max(0, index))

def separate_partition_index(center, min_co, max_co, grid_shape):
    ix = separate_axis_index(center.x, min_co.x, max_co.x, grid_shape[0])
    iy = separate_axis_index(center.y, min_co.y, max_co.y, grid_shape[1])
    iz = separate_axis_index(center.z, min_co.z, max_co.z, grid_shape[2])

    return ix + iy * grid_shape[0] + iz * grid_shape[0] * grid_shape[1]

def adjacent_separate_pairs(grid_shape):
    pairs = []
    sx, sy, sz = grid_shape

    for iz in range(sz):
        for iy in range(sy):
            for ix in range(sx):
                index = ix + iy * sx + iz * sx * sy

                if ix + 1 < sx:
                    pairs.append((index, index + 1))

                if iy + 1 < sy:
                    pairs.append((index, index + sx))

                if iz + 1 < sz:
                    pairs.append((index, index + sx * sy))

    return pairs

def merge_random_adjacent_partitions(partitions, target_count, grid_shape):
    rng = random.Random(SEPARATE_RANDOM_SEED)

    while len(partitions) > target_count:
        available_indices = set(partitions.keys())
        pairs = [
            pair for pair in adjacent_separate_pairs(grid_shape)
            if pair[0] in available_indices and pair[1] in available_indices
        ]

        if not pairs:
            keys = sorted(partitions.keys())
            if len(keys) < 2:
                break
            pairs = [(keys[i], keys[i + 1]) for i in range(len(keys) - 1)]

        keep, remove = rng.choice(pairs)

        if keep not in partitions or remove not in partitions:
            continue

        partitions[keep].extend(partitions[remove])
        del partitions[remove]

def split_separate_partition(mesh, poly_indices):
    if len(poly_indices) <= 1:
        return None

    centers = [
        (poly_index, polygon_center(mesh, mesh.polygons[poly_index]))
        for poly_index in poly_indices
    ]
    spreads = []

    for axis in range(3):
        values = [center[axis] for _, center in centers]
        spreads.append(max(values) - min(values))

    split_axis = max(range(3), key=lambda axis: spreads[axis])

    if spreads[split_axis] < EPSILON:
        split_axis = max(
            range(3),
            key=lambda axis: len(set(round_f(center[axis]) for _, center in centers))
        )

    centers.sort(
        key=lambda item: (
            item[1][split_axis],
            item[1][(split_axis + 1) % 3],
            item[1][(split_axis + 2) % 3],
            item[0],
        )
    )

    split_at = len(centers) // 2

    if split_at <= 0 or split_at >= len(centers):
        return None

    first = [poly_index for poly_index, _ in centers[:split_at]]
    second = [poly_index for poly_index, _ in centers[split_at:]]

    if not first or not second:
        return None

    return first, second

def partition_split_score(mesh, poly_indices):
    if len(poly_indices) <= 1:
        return (0, 0.0)

    centers = [
        polygon_center(mesh, mesh.polygons[poly_index])
        for poly_index in poly_indices
    ]
    spreads = []

    for axis in range(3):
        values = [center[axis] for center in centers]
        spreads.append(max(values) - min(values))

    return (len(poly_indices), max(spreads))

def split_partitions_to_target(mesh, partitions, target_count):
    next_index = max(partitions.keys(), default=-1) + 1

    while len(partitions) < target_count:
        splittable = [
            (index, poly_indices)
            for index, poly_indices in partitions.items()
            if len(poly_indices) > 1
        ]

        if not splittable:
            break

        index, poly_indices = max(
            splittable,
            key=lambda item: partition_split_score(mesh, item[1])
        )
        split = split_separate_partition(mesh, poly_indices)

        if split is None:
            break

        first, second = split
        partitions[index] = first
        partitions[next_index] = second
        next_index += 1

def build_separate_partitions(mesh):
    target_count = max(1, int(SEPARATE_TARGET_BLOCKS))
    base_count = separate_base_count(target_count)
    min_co, max_co = get_bounds(mesh)
    grid_shape = separate_grid_shape(base_count, max_co - min_co)
    partitions = {i: [] for i in range(base_count)}

    for poly in mesh.polygons:
        center = polygon_center(mesh, poly)
        index = separate_partition_index(
            center,
            min_co,
            max_co,
            grid_shape,
        )
        partitions[index].append(poly.index)

    partitions = {
        index: poly_indices
        for index, poly_indices in partitions.items()
        if poly_indices
    }

    if target_count % 2 == 1 and len(partitions) > target_count:
        merge_random_adjacent_partitions(
            partitions,
            target_count,
            grid_shape,
        )

    if len(partitions) < target_count:
        split_partitions_to_target(mesh, partitions, target_count)

    result = [
        tuple(poly_indices)
        for _, poly_indices in sorted(partitions.items(), key=lambda item: item[0])
    ]

    print(
        f"Separate partitions: {len(result)} "
        f"(target {target_count}, grid {grid_shape[0]}x{grid_shape[1]}x{grid_shape[2]})"
    )
    return result

def make_separate_mesh(name, source_mesh, poly_indices):
    vertex_map = {}
    old_vertex_by_new = []
    verts = []
    faces = []
    source_loops_by_new_poly = []
    source_poly_by_new_poly = []

    def mapped_vertex(old_index):
        if old_index in vertex_map:
            return vertex_map[old_index]

        new_index = len(verts)
        vertex_map[old_index] = new_index
        old_vertex_by_new.append(old_index)
        verts.append(source_mesh.vertices[old_index].co.copy())
        return new_index

    for poly_index in poly_indices:
        poly = source_mesh.polygons[poly_index]
        faces.append([mapped_vertex(vertex_index) for vertex_index in poly.vertices])
        source_loops_by_new_poly.append(tuple(poly.loop_indices))
        source_poly_by_new_poly.append(poly_index)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    for mat in source_mesh.materials:
        mesh.materials.append(mat)

    for src_uv_layer in source_mesh.uv_layers:
        mesh.uv_layers.new(name=src_uv_layer.name)

    for src_attr in source_mesh.color_attributes:
        try:
            mesh.color_attributes.new(
                name=src_attr.name,
                type=src_attr.data_type,
                domain=src_attr.domain
            )
        except RuntimeError:
            pass

    for new_poly_index, poly in enumerate(mesh.polygons):
        src_poly = source_mesh.polygons[source_poly_by_new_poly[new_poly_index]]
        src_loop_indices = source_loops_by_new_poly[new_poly_index]
        poly.material_index = min(src_poly.material_index, max(0, len(mesh.materials) - 1))

        for corner_index, loop_index in enumerate(poly.loop_indices):
            src_loop_index = src_loop_indices[corner_index]

            for layer_index, uv_layer in enumerate(mesh.uv_layers):
                uv_layer.data[loop_index].uv = source_mesh.uv_layers[layer_index].data[src_loop_index].uv

    for color_attr in mesh.color_attributes:
        src_attr = source_mesh.color_attributes.get(color_attr.name)

        if src_attr is None:
            continue

        if color_attr.domain == "CORNER":
            for new_poly_index, poly in enumerate(mesh.polygons):
                src_loop_indices = source_loops_by_new_poly[new_poly_index]
                for corner_index, loop_index in enumerate(poly.loop_indices):
                    src_loop_index = src_loop_indices[corner_index]
                    color_attr.data[loop_index].color = src_attr.data[src_loop_index].color

        elif color_attr.domain == "POINT":
            for new_vertex_index, old_vertex_index in enumerate(old_vertex_by_new):
                color_attr.data[new_vertex_index].color = src_attr.data[old_vertex_index].color

        elif color_attr.domain == "FACE":
            for new_poly_index, src_poly_index in enumerate(source_poly_by_new_poly):
                color_attr.data[new_poly_index].color = src_attr.data[src_poly_index].color

    try:
        if source_mesh.color_attributes.active_color:
            active_name = source_mesh.color_attributes.active_color.name
            for i, attr in enumerate(mesh.color_attributes):
                if attr.name == active_name:
                    mesh.color_attributes.active_color_index = i
                    break
    except Exception:
        pass

    try:
        if source_mesh.color_attributes.render_color_index >= 0:
            src_render_attr = source_mesh.color_attributes[
                source_mesh.color_attributes.render_color_index
            ]
            for i, attr in enumerate(mesh.color_attributes):
                if attr.name == src_render_attr.name:
                    mesh.color_attributes.render_color_index = i
                    break
    except Exception:
        pass

    mesh.update()
    return mesh

# ============================================================
# Mesh 获取
# ============================================================

def get_source_mesh_and_matrix(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()

    if USE_EVALUATED_MESH:
        eval_obj = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(eval_obj, depsgraph=depsgraph)
        matrix_world = eval_obj.matrix_world.copy()
    else:
        mesh = obj.data.copy()
        matrix_world = obj.matrix_world.copy()

    mesh.update()
    return mesh, matrix_world

# ============================================================
# 主处理
# ============================================================

def shatter_object(obj):
    print(f"\nProcessing object: {obj.name}")

    source_mesh, source_matrix_world = get_source_mesh_and_matrix(obj)

    if len(source_mesh.vertices) == 0:
        print(f"Skipped {obj.name}: no vertices.")
        return

    if SHATTER_MODE == 2:
        partitions = build_separate_partitions(source_mesh)

        if len(partitions) > MAX_OUTPUT_CUBES_PER_OBJECT:
            raise RuntimeError(
                f"{obj.name} would generate {len(partitions)} blocks, "
                f"which exceeds MAX_OUTPUT_CUBES_PER_OBJECT."
            )

        output_collection = create_output_collection_for_object(obj)

        for i, poly_indices in enumerate(partitions):
            block_mesh = make_separate_mesh(
                name=f"{obj.name}_separate_{i:05d}_mesh",
                source_mesh=source_mesh,
                poly_indices=poly_indices,
            )

            block_obj = bpy.data.objects.new(
                f"{obj.name}_separate_{i:05d}",
                block_mesh
            )

            output_collection.objects.link(block_obj)
            block_obj.matrix_world = rounded_matrix(source_matrix_world)

        if USE_EVALUATED_MESH:
            bpy.data.meshes.remove(source_mesh)

        print(f"Done: {obj.name}")
        return

    grid = VoxelGrid(source_mesh)

    print(f"Grid origin center: {grid.origin_center}")
    print(f"Voxel size: {VOXEL_SIZE}")

    surface_occupancy, face_map, records_by_voxel = build_surface_occupancy_and_face_map(
        source_mesh,
        grid
    )

    print(f"Surface voxel candidates: {len(surface_occupancy)}")

    if FILL_VOLUME_BY_SCANLINE:
        full_occupancy = fill_volume_by_scanline(surface_occupancy, SCANLINE_AXIS)
        print(f"Filled voxel candidates: {len(full_occupancy)}")
    else:
        full_occupancy = surface_occupancy

    output_keys = filter_outer_layer(full_occupancy)

    print(f"Outer layer cubes: {len(output_keys)}")

    blocks = build_merged_blocks(full_occupancy, output_keys, randomize=(SHATTER_MODE == 1))

    if len(blocks) > MAX_OUTPUT_CUBES_PER_OBJECT:
        raise RuntimeError(
            f"{obj.name} would generate {len(blocks)} blocks, "
            f"which exceeds MAX_OUTPUT_CUBES_PER_OBJECT."
        )

    output_collection = create_output_collection_for_object(obj)

    sorted_blocks = sorted(
        blocks,
        key=lambda block: (
            block["min_key"][2],
            block["min_key"][1],
            block["min_key"][0],
            block["dims"],
        )
    )

    for i, block in enumerate(sorted_blocks):
        center = block_center_from_cells(grid, block)
        center = round_vector(center)

        block_mesh = make_voxel_block_mesh(
            name=f"{obj.name}_block_{i:05d}_mesh",
            source_mesh=source_mesh,
            center=center,
            block=block,
            face_map=face_map,
            records_by_voxel=records_by_voxel
        )

        block_obj = bpy.data.objects.new(
            f"{obj.name}_block_{i:05d}_{block['dims'][0]}x{block['dims'][1]}x{block['dims'][2]}",
            block_mesh
        )

        output_collection.objects.link(block_obj)

        # 保留原对象的世界变换，同时让 block 的局部中心严格落在体素网格上
        block_obj.matrix_world = rounded_matrix(
            source_matrix_world @ Matrix.Translation(center)
        )

    if USE_EVALUATED_MESH:
        bpy.data.meshes.remove(source_mesh)

    print(f"Done: {obj.name}")

selected_mesh_objects = [
    obj for obj in bpy.context.selected_objects
    if obj.type == "MESH"
]

if SHATTER_MODE not in {0, 1, 2}:
    raise RuntimeError("SHATTER_MODE must be 0 (merge), 1 (random), or 2 (separate).")

if not selected_mesh_objects:
    raise RuntimeError("请先选中一个或多个 Mesh 对象。")

for obj in selected_mesh_objects:
    shatter_object(obj)

print("\nAll selected objects processed.")
