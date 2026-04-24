#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    int rows;
    int cols;
} Grid;

static int idx_of(int r, int c, int cols) {
    return r * cols + c;
}

static int in_bounds(int r, int c, Grid g) {
    return r >= 0 && r < g.rows && c >= 0 && c < g.cols;
}

static int count_adjacent_mines(const char *board, int r, int c, Grid g) {
    int dr, dc, count = 0;
    for (dr = -1; dr <= 1; dr++) {
        for (dc = -1; dc <= 1; dc++) {
            int nr = r + dr;
            int nc = c + dc;
            if (dr == 0 && dc == 0) {
                continue;
            }
            if (!in_bounds(nr, nc, g)) {
                continue;
            }
            if (board[idx_of(nr, nc, g.cols)] == '*') {
                count++;
            }
        }
    }
    return count;
}

static int flood_reveal(const char *board, char *visible, int start_r, int start_c, Grid g) {
    int total = g.rows * g.cols;
    int *queue = (int *)malloc(sizeof(int) * total);
    unsigned char *queued = (unsigned char *)calloc((size_t)total, sizeof(unsigned char));
    int head = 0, tail = 0;
    int newly_revealed = 0;

    if (!queue || !queued) {
        free(queue);
        free(queued);
        return 0;
    }

    {
        int start = idx_of(start_r, start_c, g.cols);
        queue[tail++] = start;
        queued[start] = 1;
    }

    while (head < tail) {
        int cur = queue[head++];
        int r = cur / g.cols;
        int c = cur % g.cols;
        int i = idx_of(r, c, g.cols);

        if (visible[i] == '1') {
            continue;
        }
        if (board[i] == '*') {
            continue;
        }

        visible[i] = '1';
        newly_revealed++;

        if (count_adjacent_mines(board, r, c, g) != 0) {
            continue;
        }

        for (int dr = -1; dr <= 1; dr++) {
            for (int dc = -1; dc <= 1; dc++) {
                int nr = r + dr;
                int nc = c + dc;
                if (dr == 0 && dc == 0) {
                    continue;
                }
                if (!in_bounds(nr, nc, g)) {
                    continue;
                }
                {
                    int ni = idx_of(nr, nc, g.cols);
                    if (queued[ni] || visible[ni] == '1' || board[ni] == '*') {
                        continue;
                    }
                    if (tail >= total) {
                        continue;
                    }
                    queue[tail++] = ni;
                    queued[ni] = 1;
                }
            }
        }
    }

    free(queue);
    free(queued);
    return newly_revealed;
}

static int all_safe_revealed(const char *board, const char *visible, Grid g) {
    int total = g.rows * g.cols;
    for (int i = 0; i < total; i++) {
        if (board[i] != '*' && visible[i] != '1') {
            return 0;
        }
    }
    return 1;
}

static void cmd_init(int rows, int cols, int mines, unsigned int seed) {
    Grid g = { rows, cols };
    int total = rows * cols;
    char *board = (char *)malloc((size_t)total + 1);
    int placed = 0;

    if (!board || mines >= total) {
        printf("error invalid_init\n");
        free(board);
        return;
    }

    for (int i = 0; i < total; i++) {
        board[i] = '.';
    }
    board[total] = '\0';

    srand(seed);
    while (placed < mines) {
        int p = rand() % total;
        if (board[p] == '*') {
            continue;
        }
        board[p] = '*';
        placed++;
    }

    printf("ok board=%s\n", board);
    free(board);
}

static void cmd_reveal(int rows, int cols, const char *board, const char *visible, int r, int c) {
    Grid g = { rows, cols };
    int total = rows * cols;
    char *next_visible = (char *)malloc((size_t)total + 1);
    int revealed = 0;
    int mine_hit = 0;
    int game_over = 0;

    if (!next_visible || (int)strlen(board) != total || (int)strlen(visible) != total) {
        printf("error invalid_state\n");
        free(next_visible);
        return;
    }
    if (!in_bounds(r, c, g)) {
        printf("error out_of_bounds\n");
        free(next_visible);
        return;
    }

    strcpy(next_visible, visible);

    int i = idx_of(r, c, cols);
    if (next_visible[i] == '1') {
        printf("ok mine=0 newly=0 game_over=%d visible=%s\n", all_safe_revealed(board, next_visible, g), next_visible);
        free(next_visible);
        return;
    }

    if (board[i] == '*') {
        mine_hit = 1;
        next_visible[i] = '1';
        revealed = 1;
    } else {
        revealed = flood_reveal(board, next_visible, r, c, g);
    }

    if (all_safe_revealed(board, next_visible, g)) {
        game_over = 1;
    }

    printf("ok mine=%d newly=%d game_over=%d visible=%s\n", mine_hit, revealed, game_over, next_visible);
    free(next_visible);
}

static void cmd_toggle_flag(int rows, int cols, const char *visible, const char *flags, int r, int c) {
    Grid g = { rows, cols };
    int total = rows * cols;
    char *next_flags = (char *)malloc((size_t)total + 1);
    int i;

    if (!next_flags || (int)strlen(visible) != total || (int)strlen(flags) != total) {
        printf("error invalid_state\n");
        free(next_flags);
        return;
    }
    if (!in_bounds(r, c, g)) {
        printf("error out_of_bounds\n");
        free(next_flags);
        return;
    }

    strcpy(next_flags, flags);
    i = idx_of(r, c, cols);
    if (visible[i] == '1') {
        printf("ok flags=%s\n", next_flags);
        free(next_flags);
        return;
    }

    next_flags[i] = (next_flags[i] == '1') ? '0' : '1';
    printf("ok flags=%s\n", next_flags);
    free(next_flags);
}

int main(int argc, char **argv) {
    if (argc < 2) {
        printf("error missing_command\n");
        return 1;
    }

    if (strcmp(argv[1], "init") == 0) {
        if (argc != 6) {
            printf("error usage_init\n");
            return 1;
        }
        cmd_init(atoi(argv[2]), atoi(argv[3]), atoi(argv[4]), (unsigned int)strtoul(argv[5], NULL, 10));
        return 0;
    }

    if (strcmp(argv[1], "reveal") == 0) {
        if (argc != 8) {
            printf("error usage_reveal\n");
            return 1;
        }
        cmd_reveal(atoi(argv[2]), atoi(argv[3]), argv[4], argv[5], atoi(argv[6]), atoi(argv[7]));
        return 0;
    }

    if (strcmp(argv[1], "flag") == 0) {
        if (argc != 8) {
            printf("error usage_flag\n");
            return 1;
        }
        cmd_toggle_flag(atoi(argv[2]), atoi(argv[3]), argv[4], argv[5], atoi(argv[6]), atoi(argv[7]));
        return 0;
    }

    printf("error unknown_command\n");
    return 1;
}
