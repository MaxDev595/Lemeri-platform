<?php
/**
 * Plugin Name:       Lemiri AI — чат с ИИ-сотрудником
 * Plugin URI:        https://lemeriai.com
 * Description:       Добавляет на сайт чат с ИИ-сотрудником Lemiri AI. Подключение в один клик, без кода.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Lemiri AI
 * License:           GPL-2.0-or-later
 * Text Domain:       lemiri-ai
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const LEMIRI_AI_OPTION   = 'lemiri_ai_settings';
const LEMIRI_AI_PAGE     = 'lemiri-ai';
const LEMIRI_AI_DEFAULT  = 'https://lemeriai.com';

function lemiri_ai_settings() {
	$saved = get_option( LEMIRI_AI_OPTION, array() );
	return wp_parse_args( is_array( $saved ) ? $saved : array(), array(
		'embed_url' => '',
		'enabled'   => true,
		'base'      => LEMIRI_AI_DEFAULT,
	) );
}

function lemiri_ai_base() {
	$base = untrailingslashit( lemiri_ai_settings()['base'] );
	return apply_filters( 'lemiri_ai_base_url', $base ? $base : LEMIRI_AI_DEFAULT );
}

/** Accepts the full <script> snippet or just its URL; returns a clean embed.js URL or ''. */
function lemiri_ai_extract_embed( $value ) {
	$value = trim( wp_unslash( (string) $value ) );
	if ( preg_match( '~src=["\']([^"\']+)["\']~i', $value, $m ) ) {
		$value = $m[1];
	}
	$value = esc_url_raw( $value, array( 'http', 'https' ) );
	if ( ! preg_match( '~^https?://[^/\s]+/api/widget/[A-Za-z0-9_-]+/embed\.js$~', $value ) ) {
		return '';
	}
	return $value;
}

function lemiri_ai_admin_url( $args = array() ) {
	return add_query_arg( $args, admin_url( 'options-general.php?page=' . LEMIRI_AI_PAGE ) );
}

/* ---------- Front end: print the widget ---------- */

add_action( 'wp_footer', function () {
	$s = lemiri_ai_settings();
	if ( empty( $s['enabled'] ) || empty( $s['embed_url'] ) || is_admin() ) {
		return;
	}
	printf( "<script src=\"%s\" async></script>\n", esc_url( $s['embed_url'] ) );
}, 99 );

/* ---------- Admin ---------- */

add_action( 'admin_menu', function () {
	add_options_page( 'Lemiri AI', 'Lemiri AI', 'manage_options', LEMIRI_AI_PAGE, 'lemiri_ai_render_page' );
} );

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	array_unshift( $links, '<a href="' . esc_url( lemiri_ai_admin_url() ) . '">' . esc_html__( 'Настройки', 'lemiri-ai' ) . '</a>' );
	return $links;
} );

add_action( 'admin_notices', function () {
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
	if ( ! current_user_can( 'manage_options' ) || ( $screen && 'settings_page_' . LEMIRI_AI_PAGE === $screen->id ) ) {
		return;
	}
	if ( empty( lemiri_ai_settings()['embed_url'] ) ) {
		echo '<div class="notice notice-info"><p><b>Lemiri AI:</b> ' . esc_html__( 'подключите ИИ-сотрудника к сайту — это займёт минуту.', 'lemiri-ai' ) . ' <a href="' . esc_url( lemiri_ai_admin_url() ) . '">' . esc_html__( 'Подключить', 'lemiri-ai' ) . '</a></p></div>';
	}
} );

/** Handles the connect/disconnect buttons, the manual form and the return from Lemiri. */
add_action( 'admin_init', function () {
	if ( ! current_user_can( 'manage_options' ) || ( $_GET['page'] ?? '' ) !== LEMIRI_AI_PAGE ) {
		return;
	}
	$user_key = 'lemiri_ai_state_' . get_current_user_id();

	// 1. "Подключить к Lemiri": remember a one-time state and go to the platform.
	if ( isset( $_GET['lemiri_connect'] ) ) {
		check_admin_referer( 'lemiri_ai_connect' );
		$state = wp_generate_password( 32, false, false );
		set_transient( $user_key, $state, 30 * MINUTE_IN_SECONDS );
		$target = add_query_arg( array(
			'site'   => rawurlencode( home_url( '/' ) ),
			'return' => rawurlencode( lemiri_ai_admin_url() ),
			'state'  => $state,
		), lemiri_ai_base() . '/connect/wordpress' );
		wp_redirect( $target ); // phpcs:ignore WordPress.Security.SafeRedirect -- the platform lives on another domain.
		exit;
	}

	// 2. Back from Lemiri with the embed URL.
	if ( isset( $_GET['lemiri_embed'], $_GET['lemiri_state'] ) ) {
		$expected = get_transient( $user_key );
		delete_transient( $user_key );
		$embed    = lemiri_ai_extract_embed( $_GET['lemiri_embed'] );
		$base     = wp_parse_url( lemiri_ai_base(), PHP_URL_HOST );
		$ok       = $expected && hash_equals( (string) $expected, (string) wp_unslash( $_GET['lemiri_state'] ) ) && $embed && wp_parse_url( $embed, PHP_URL_HOST ) === $base;
		if ( $ok ) {
			$s              = lemiri_ai_settings();
			$s['embed_url'] = $embed;
			$s['enabled']   = true;
			update_option( LEMIRI_AI_OPTION, $s );
		}
		wp_safe_redirect( lemiri_ai_admin_url( array( 'lemiri_result' => $ok ? 'connected' : 'failed' ) ) );
		exit;
	}

	// 3. Manual form: paste the code, toggle, change platform address.
	if ( 'POST' === ( $_SERVER['REQUEST_METHOD'] ?? '' ) && isset( $_POST['lemiri_ai_action'] ) ) {
		check_admin_referer( 'lemiri_ai_save' );
		$s      = lemiri_ai_settings();
		$action = sanitize_key( wp_unslash( $_POST['lemiri_ai_action'] ) );
		$result = 'saved';
		if ( 'disconnect' === $action ) {
			$s['embed_url'] = '';
			$result         = 'disconnected';
		} else {
			if ( isset( $_POST['embed'] ) && '' !== trim( (string) wp_unslash( $_POST['embed'] ) ) ) {
				$embed = lemiri_ai_extract_embed( $_POST['embed'] );
				if ( $embed ) {
					$s['embed_url'] = $embed;
				} else {
					$result = 'invalid';
				}
			}
			$s['enabled'] = ! empty( $_POST['enabled'] );
			if ( isset( $_POST['base'] ) ) {
				$base      = esc_url_raw( trim( (string) wp_unslash( $_POST['base'] ) ), array( 'http', 'https' ) );
				$s['base'] = $base ? untrailingslashit( $base ) : LEMIRI_AI_DEFAULT;
			}
		}
		update_option( LEMIRI_AI_OPTION, $s );
		wp_safe_redirect( lemiri_ai_admin_url( array( 'lemiri_result' => $result ) ) );
		exit;
	}
} );

function lemiri_ai_render_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$s       = lemiri_ai_settings();
	$result  = sanitize_key( $_GET['lemiri_result'] ?? '' );
	$notices = array(
		'connected'    => array( 'success', 'Готово! ИИ-сотрудник подключён и уже отвечает на сайте.' ),
		'failed'       => array( 'error', 'Не удалось завершить подключение. Нажмите «Подключить к Lemiri» ещё раз.' ),
		'saved'        => array( 'success', 'Настройки сохранены.' ),
		'invalid'      => array( 'error', 'Не похоже на код Lemiri. Скопируйте код в кабинете: Каналы → Чат на сайте.' ),
		'disconnected' => array( 'warning', 'Чат отключён от сайта.' ),
	);
	$connect = wp_nonce_url( lemiri_ai_admin_url( array( 'lemiri_connect' => 1 ) ), 'lemiri_ai_connect' );
	?>
	<div class="wrap">
		<h1>Lemiri AI</h1>
		<?php if ( isset( $notices[ $result ] ) ) : ?>
			<div class="notice notice-<?php echo esc_attr( $notices[ $result ][0] ); ?> is-dismissible"><p><?php echo esc_html( $notices[ $result ][1] ); ?></p></div>
		<?php endif; ?>

		<div style="max-width:720px;padding:20px 24px;margin:16px 0;background:#fff;border:1px solid #dcdcde;border-radius:10px">
			<?php if ( $s['embed_url'] ) : ?>
				<h2 style="margin-top:0">✅ Чат подключён</h2>
				<p>Виджет показывается на всех страницах сайта<?php echo $s['enabled'] ? '' : ' — <b>сейчас выключен</b>'; ?>. Внешний вид, приветствие и цвет меняются в кабинете Lemiri — код менять не нужно.</p>
				<p><a class="button button-primary" href="<?php echo esc_url( lemiri_ai_base() . '/app' ); ?>" target="_blank" rel="noopener">Открыть кабинет Lemiri</a>
				<a class="button" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener">Посмотреть на сайте</a></p>
			<?php else : ?>
				<h2 style="margin-top:0">Подключите ИИ-сотрудника за минуту</h2>
				<p>Нажмите кнопку, войдите в Lemiri и выберите сотрудника. Плагин сам добавит чат на все страницы сайта.</p>
				<p><a class="button button-primary button-hero" href="<?php echo esc_url( $connect ); ?>">Подключить к Lemiri</a></p>
			<?php endif; ?>
		</div>

		<form method="post" style="max-width:720px">
			<?php wp_nonce_field( 'lemiri_ai_save' ); ?>
			<h2>Вручную</h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="lemiri-embed">Код виджета</label></th>
					<td><textarea id="lemiri-embed" name="embed" rows="3" class="large-text code" placeholder="<script src=&quot;https://lemeriai.com/api/widget/…/embed.js&quot; async></script>"><?php echo esc_textarea( $s['embed_url'] ); ?></textarea>
					<p class="description">Вставьте код из кабинета Lemiri (Каналы → Чат на сайте) — подойдёт и весь тег, и только ссылка.</p></td>
				</tr>
				<tr>
					<th scope="row">Показывать чат</th>
					<td><label><input type="checkbox" name="enabled" value="1" <?php checked( ! empty( $s['enabled'] ) ); ?>> Включён на сайте</label></td>
				</tr>
				<tr>
					<th scope="row"><label for="lemiri-base">Адрес платформы</label></th>
					<td><input id="lemiri-base" name="base" type="url" class="regular-text" value="<?php echo esc_attr( $s['base'] ); ?>">
					<p class="description">Меняйте, только если вам дали другой адрес Lemiri.</p></td>
				</tr>
			</table>
			<p>
				<button class="button button-primary" name="lemiri_ai_action" value="save">Сохранить</button>
				<?php if ( $s['embed_url'] ) : ?>
					<button class="button button-link-delete" name="lemiri_ai_action" value="disconnect" onclick="return confirm('Убрать чат с сайта?')">Отключить</button>
				<?php endif; ?>
			</p>
		</form>
	</div>
	<?php
}

register_uninstall_hook( __FILE__, 'lemiri_ai_uninstall' );
function lemiri_ai_uninstall() {
	delete_option( LEMIRI_AI_OPTION );
}
